import Dexie, { type Table } from 'dexie';
import { migrateDeck, migrateTags, parseCheck } from './decks';
import { DEFAULT_SETTINGS, type Card, type ReviewLog, type Settings } from './types';

interface MetaRow {
  key: string;
  value: unknown;
}

export class GoiDB extends Dexie {
  cards!: Table<Card, string>;
  logs!: Table<ReviewLog, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'goi-app') {
    super(name);
    this.version(1).stores({
      cards: 'id, updated',
      logs: 'id, cardId, reviewedAt',
      meta: 'key',
    });
    // Schema 2: every card has a deck.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('cards')
          .toCollection()
          .modify((c: Card) => {
            c.deck = migrateDeck((c as Partial<Card>).deck, c.source ?? '');
          }),
      );
    // Schema 3: a check record on every card, and the unverified tag gone.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('cards')
          .toCollection()
          .modify((c: Card) => {
            c.check = parseCheck((c as Partial<Card>).check);
            c.tags = migrateTags(c.tags ?? []);
          }),
      );
  }
}

export const db = new GoiDB();

export async function loadSettings(d: GoiDB = db): Promise<Settings> {
  const row = await d.meta.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(settings: Settings, d: GoiDB = db): Promise<void> {
  await d.meta.put({ key: 'settings', value: settings });
}

export async function logsSince(since: number, d: GoiDB = db): Promise<ReviewLog[]> {
  return d.logs.where('reviewedAt').aboveOrEqual(since).toArray();
}

/** Replace the entire contents of the database in one transaction. */
export async function replaceAll(cards: Card[], logs: ReviewLog[], settings: Settings, d: GoiDB = db): Promise<void> {
  await d.transaction('rw', d.cards, d.logs, d.meta, async () => {
    await d.cards.clear();
    await d.logs.clear();
    await d.cards.bulkPut(cards);
    await d.logs.bulkPut(logs);
    await d.meta.put({ key: 'settings', value: settings });
  });
}
