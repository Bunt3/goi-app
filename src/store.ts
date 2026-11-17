import { createCard } from './cards';
import { buildExport } from './data/export';
import { planMerge, type MergePlan } from './data/merge';
import type { CardDraft } from './data/tsv';
import { startOfDay } from './day';
import { db as defaultDb, loadSettings, logsSince, replaceAll, saveSettings, type GoiDB } from './db';
import { applyReview, resetProgress, type Rating } from './srs/fsrs';
import { DEFAULT_SETTINGS, type Card, type Direction, type ExportFile, type ReviewLog, type Settings } from './types';

export interface AnswerUndo {
  previous: Card;
  logId: string;
}

/**
 * In-memory view of the deck with write-through to IndexedDB. All cards are
 * held in memory (a personal deck is a few thousand rows at most); review
 * logs are only loaded for the current study day.
 */
export class Store {
  cards = new Map<string, Card>();
  settings: Settings = { ...DEFAULT_SETTINGS };
  todayLogs: ReviewLog[] = [];
  private todayStart = 0;

  constructor(private readonly db: GoiDB = defaultDb) {}

  async load(now = Date.now()): Promise<void> {
    this.settings = await loadSettings(this.db);
    const all = await this.db.cards.toArray();
    this.cards = new Map(all.map((c) => [c.id, c]));
    await this.refreshToday(now, true);
  }

  /** Re-read today's logs if the study day has rolled over (or when forced). */
  async refreshToday(now = Date.now(), force = false): Promise<void> {
    const start = startOfDay(now);
    if (!force && start === this.todayStart) return;
    this.todayStart = start;
    this.todayLogs = await logsSince(start, this.db);
  }

  /** Cards that have not been deleted. */
  live(): Card[] {
    const out: Card[] = [];
    for (const c of this.cards.values()) if (!c.deleted) out.push(c);
    return out;
  }

  async setSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await saveSettings(this.settings, this.db);
  }

  async addCard(draft: Partial<CardDraft> & { word: string }, now = Date.now(), id?: string): Promise<Card> {
    const card = createCard(draft, now, id);
    await this.db.cards.put(card);
    this.cards.set(card.id, card);
    return card;
  }

  async addCards(cards: Card[]): Promise<void> {
    await this.db.cards.bulkPut(cards);
    for (const c of cards) this.cards.set(c.id, c);
  }

  /** Save a content edit. Bumps `updated` so the edit wins a later merge. */
  async editCard(id: string, patch: Partial<CardDraft>, now = Date.now()): Promise<Card> {
    const current = this.cards.get(id);
    if (!current) throw new Error('Card not found');
    const next: Card = { ...current, ...patch, updated: Math.max(now, current.updated + 1) };
    await this.db.cards.put(next);
    this.cards.set(id, next);
    return next;
  }

  /** Soft-delete: the card becomes a tombstone so the deletion propagates on merge. */
  async deleteCard(id: string, now = Date.now()): Promise<void> {
    const current = this.cards.get(id);
    if (!current) return;
    const next: Card = { ...current, deleted: true, updated: Math.max(now, current.updated + 1) };
    await this.db.cards.put(next);
    this.cards.set(id, next);
  }

  async answer(cardId: string, direction: Direction, rating: Rating, now = Date.now(), durationMs = 0): Promise<AnswerUndo> {
    const previous = this.cards.get(cardId);
    if (!previous) throw new Error('Card not found');
    await this.refreshToday(now);
    const { card, log } = applyReview(previous, direction, rating, now, this.settings.requestRetention, durationMs);
    await this.db.transaction('rw', this.db.cards, this.db.logs, async () => {
      await this.db.cards.put(card);
      await this.db.logs.put(log);
    });
    this.cards.set(card.id, card);
    this.todayLogs.push(log);
    return { previous, logId: log.id };
  }

  /** Take back the last answer: restores scheduling state and removes its log. */
  async undo(undo: AnswerUndo): Promise<void> {
    const current = this.cards.get(undo.previous.id);
    if (!current) return;
    // Only scheduling is rolled back; any text edit made since is kept.
    const restored: Card = { ...current, srs: undo.previous.srs, productionUnlockedAt: undo.previous.productionUnlockedAt };
    await this.db.transaction('rw', this.db.cards, this.db.logs, async () => {
      await this.db.cards.put(restored);
      await this.db.logs.delete(undo.logId);
    });
    this.cards.set(restored.id, restored);
    this.todayLogs = this.todayLogs.filter((l) => l.id !== undo.logId);
  }

  async resetCardProgress(id: string, now = Date.now()): Promise<void> {
    const current = this.cards.get(id);
    if (!current) return;
    const { card, logs } = resetProgress(current, now);
    await this.db.transaction('rw', this.db.cards, this.db.logs, async () => {
      await this.db.cards.put(card);
      await this.db.logs.bulkPut(logs);
    });
    this.cards.set(id, card);
    this.todayLogs.push(...logs);
  }

  async allLogs(): Promise<ReviewLog[]> {
    return this.db.logs.toArray();
  }

  /** Build the backup file and record that an export happened. */
  async export(now = Date.now()): Promise<ExportFile> {
    await this.setSettings({ lastExportAt: now });
    return buildExport([...this.cards.values()], await this.allLogs(), this.settings, now);
  }

  async planImport(file: ExportFile): Promise<MergePlan> {
    return planMerge([...this.cards.values()], await this.allLogs(), file, this.settings.requestRetention);
  }

  async applyMerge(plan: MergePlan, now = Date.now()): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.logs, async () => {
      await this.db.cards.bulkPut(plan.cards);
      await this.db.logs.bulkPut(plan.logs);
    });
    await this.load(now);
  }

  /**
   * Discard everything on this device and load the file instead. This
   * device's own label and voice choice are kept if they were set.
   */
  async replaceWith(file: ExportFile, now = Date.now()): Promise<void> {
    const settings: Settings = {
      ...file.settings,
      deviceLabel: this.settings.deviceLabel || file.settings.deviceLabel,
      ttsVoiceURI: this.settings.ttsVoiceURI ?? file.settings.ttsVoiceURI,
      lastExportAt: file.exportedAt || null,
    };
    await replaceAll(file.cards, file.reviewLogs, settings, this.db);
    await this.load(now);
  }
}
