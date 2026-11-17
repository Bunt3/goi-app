import { replayLogs } from '../srs/fsrs';
import { DIRECTIONS, type Card, type Direction, type ExportFile, type ReviewLog } from '../types';

export interface MergeSummary {
  /** Cards that exist only in the file and will be added. */
  cardsAdded: number;
  /** Cards whose text was edited more recently in the file. */
  cardsUpdatedFromFile: number;
  /** Cards whose text was edited more recently on this device (file version ignored). */
  cardsKeptLocal: number;
  /** Cards present on both sides with the same edit timestamp. */
  cardsUnchanged: number;
  /** Cards that exist only on this device (left alone). */
  cardsOnlyLocal: number;
  /** Live cards on this device that the file deleted more recently. */
  cardsDeleted: number;
  logsAdded: number;
  logsDuplicate: number;
  /** Review progress (per card direction) taken from the file because it is further along. */
  progressFromFile: number;
  /** Review progress rebuilt from the combined history because both devices reviewed the card. */
  progressReplayed: number;
  /** A few concrete examples for the confirmation screen. */
  details: string[];
}

export interface MergePlan {
  /** Cards to write (new or changed). */
  cards: Card[];
  /** Review logs to add. */
  logs: ReviewLog[];
  summary: MergeSummary;
}

const contentKey = (l: ReviewLog) => `${l.cardId}|${l.direction}|${l.reviewedAt}|${l.rating}`;
const groupKey = (cardId: string, direction: Direction) => `${cardId}|${direction}`;

function group(logs: ReviewLog[]): Map<string, ReviewLog[]> {
  const m = new Map<string, ReviewLog[]>();
  for (const l of logs) {
    const k = groupKey(l.cardId, l.direction);
    const arr = m.get(k);
    if (arr) arr.push(l);
    else m.set(k, [l]);
  }
  return m;
}

/**
 * Work out what merging a backup file into this device would do, without
 * touching anything. Rules:
 *
 * - Card text (word, reading, meanings, examples, tags, register, source,
 *   deleted flag): the side with the newer `updated` wins. Ties keep local.
 * - Review logs: union, deduplicated by id and by (card, direction, time, rating).
 * - Review progress, per card and direction: whichever side has reviews the
 *   other lacks wins. If both do, progress is rebuilt by replaying the
 *   combined history through FSRS.
 */
export function planMerge(
  localCards: Card[],
  localLogs: ReviewLog[],
  file: Pick<ExportFile, 'cards' | 'reviewLogs'>,
  requestRetention: number,
): MergePlan {
  const summary: MergeSummary = {
    cardsAdded: 0,
    cardsUpdatedFromFile: 0,
    cardsKeptLocal: 0,
    cardsUnchanged: 0,
    cardsOnlyLocal: 0,
    cardsDeleted: 0,
    logsAdded: 0,
    logsDuplicate: 0,
    progressFromFile: 0,
    progressReplayed: 0,
    details: [],
  };
  const note = (text: string) => {
    if (summary.details.length < 12) summary.details.push(text);
  };

  // --- Review logs: union with dedupe -------------------------------------
  const seenIds = new Set(localLogs.map((l) => l.id));
  const seenContent = new Set(localLogs.map(contentKey));
  const newLogs: ReviewLog[] = [];
  for (const l of file.reviewLogs) {
    const ck = contentKey(l);
    if (seenIds.has(l.id) || seenContent.has(ck)) {
      summary.logsDuplicate++;
      continue;
    }
    seenIds.add(l.id);
    seenContent.add(ck);
    newLogs.push(l);
  }
  summary.logsAdded = newLogs.length;

  const localByGroup = group(localLogs);
  const newByGroup = group(newLogs);
  // Local logs the file does not have, per card direction.
  const fileContent = new Set(file.reviewLogs.map(contentKey));
  const fileIds = new Set(file.reviewLogs.map((l) => l.id));
  const localOnly = (k: string) =>
    (localByGroup.get(k) ?? []).filter((l) => !fileIds.has(l.id) && !fileContent.has(contentKey(l)));

  // --- Cards --------------------------------------------------------------
  const localById = new Map(localCards.map((c) => [c.id, c]));
  const fileIdsSeen = new Set<string>();
  const outCards: Card[] = [];

  for (const remote of file.cards) {
    if (fileIdsSeen.has(remote.id)) continue; // a malformed file listing a card twice
    fileIdsSeen.add(remote.id);
    const local = localById.get(remote.id);
    if (!local) {
      outCards.push(remote);
      if (!remote.deleted) {
        summary.cardsAdded++;
        note(`+ ${remote.word} (new from file)`);
      }
      continue;
    }

    let merged: Card = local;
    let changed = false;

    if (remote.updated > local.updated) {
      merged = {
        ...local,
        word: remote.word,
        reading: remote.reading,
        meaning_en: remote.meaning_en,
        meaning_ja: remote.meaning_ja,
        example_ja: remote.example_ja,
        example_en: remote.example_en,
        tags: remote.tags,
        deck: remote.deck,
        check: remote.check,
        register: remote.register,
        source: remote.source,
        updated: remote.updated,
        deleted: remote.deleted,
      };
      changed = true;
      if (remote.deleted && !local.deleted) {
        summary.cardsDeleted++;
        note(`− ${local.word} (deleted on the other device)`);
      } else {
        summary.cardsUpdatedFromFile++;
        note(`↓ ${remote.word} (newer edit in file)`);
      }
    } else if (remote.updated < local.updated) {
      summary.cardsKeptLocal++;
      note(`= ${local.word} (newer edit on this device kept)`);
    } else {
      summary.cardsUnchanged++;
    }

    if (remote.created < merged.created) {
      merged = { ...merged, created: remote.created };
      changed = true;
    }

    for (const direction of DIRECTIONS) {
      const k = groupKey(local.id, direction);
      const fromFile = newByGroup.get(k) ?? [];
      if (fromFile.length === 0) continue; // file has nothing new: local progress stands
      const mine = localOnly(k);
      if (mine.length === 0) {
        merged = { ...merged, srs: { ...merged.srs, [direction]: remote.srs[direction] } };
        if (direction === 'recognition') merged.productionUnlockedAt = remote.productionUnlockedAt;
        summary.progressFromFile++;
      } else {
        const all = [...(localByGroup.get(k) ?? []), ...fromFile];
        const rebuilt = replayLogs(merged.created, all, requestRetention);
        merged = { ...merged, srs: { ...merged.srs, [direction]: rebuilt.srs } };
        if (direction === 'recognition') merged.productionUnlockedAt = rebuilt.unlockedAt;
        summary.progressReplayed++;
        note(`⟳ ${merged.word} (${direction} reviewed on both devices; history combined)`);
      }
      changed = true;
    }

    if (changed) outCards.push(merged);
  }

  for (const c of localCards) if (!fileIdsSeen.has(c.id) && !c.deleted) summary.cardsOnlyLocal++;

  return { cards: outCards, logs: newLogs, summary };
}

export function isNoop(s: MergeSummary): boolean {
  return (
    s.cardsAdded + s.cardsUpdatedFromFile + s.cardsDeleted + s.logsAdded + s.progressFromFile + s.progressReplayed === 0
  );
}
