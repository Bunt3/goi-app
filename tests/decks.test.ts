import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { parseExport, serializeExport } from '../src/data/export';
import { planMerge } from '../src/data/merge';
import { GoiDB } from '../src/db';
import { deckLabel, deckNames, inDecks, migrateDeck } from '../src/decks';
import { Store } from '../src/store';
import { SEED_DECK } from '../src/types';
import { T0, makeCard } from './helpers';

let n = 0;

describe('decks', () => {
  it('names the default deck and lists decks default-first', () => {
    expect(deckLabel('')).toBe('My cards');
    expect(deckLabel('Slang')).toBe('Slang');
    const cards = [makeCard({ deck: 'Slang' }), makeCard({ deck: '' }), makeCard({ deck: 'Workplace' }), makeCard({ deck: 'Old', deleted: true })];
    expect(deckNames(cards)).toEqual(['', 'Slang', 'Workplace']);
    expect(deckNames([], ['New'])).toEqual(['New']);
  });

  it('chooses cards by deck, with no choice meaning all', () => {
    const c = makeCard({ deck: 'Slang' });
    expect(inDecks(c, [])).toBe(true);
    expect(inDecks(c, ['Slang', ''])).toBe(true);
    expect(inDecks(c, [''])).toBe(false);
  });

  it('puts schema-1 cards in a deck: seed cards in Workplace, the rest in the default deck', () => {
    expect(migrateDeck(undefined, 'seed deck')).toBe(SEED_DECK);
    expect(migrateDeck(undefined, 'a meeting')).toBe('');
    expect(migrateDeck(' Slang ', 'seed deck')).toBe('Slang');
    const own = makeCard({ source: 'phone call' });
    const seed = makeCard({ source: 'seed deck' });
    const v1 = JSON.parse(serializeExport({ app: 'goi-app', schemaVersion: 1, exportedAt: T0, deviceLabel: '', cards: [own, seed], reviewLogs: [], settings: {} as never }));
    for (const c of v1.cards) delete c.deck;
    const file = parseExport(JSON.stringify(v1));
    expect(file.cards.map((c) => c.deck)).toEqual(['', SEED_DECK]);
    expect(file.settings.studyDecks).toEqual([]);
  });

  it('upgrades a schema-1 database in place', async () => {
    const name = `decks-${++n}`;
    const old = new Dexie(name);
    old.version(1).stores({ cards: 'id, updated', logs: 'id, cardId, reviewedAt', meta: 'key' });
    const own = { ...makeCard({ source: '' }) } as Record<string, unknown>;
    const seed = { ...makeCard({ source: 'seed deck' }) } as Record<string, unknown>;
    delete own.deck;
    delete seed.deck;
    await old.table('cards').bulkPut([own, seed]);
    old.close();
    const store = new Store(new GoiDB(name));
    await store.load(T0);
    expect([...store.cards.values()].map((c) => c.deck).sort()).toEqual(['', SEED_DECK]);
  });

  it('studies only the chosen decks', async () => {
    const store = new Store(new GoiDB(`decks-${++n}`));
    await store.load(T0);
    await store.addCard({ word: '稟議', reading: 'りんぎ', meaning_en: 'circular' }, T0);
    await store.addCard({ word: 'ワンチャン', reading: 'わんちゃん', meaning_en: 'maybe', deck: 'Slang' }, T0 + 1);
    expect(store.studying()).toHaveLength(2);
    await store.setSettings({ studyDecks: ['Slang'] });
    expect(store.studying().map((c) => c.word)).toEqual(['ワンチャン']);
  });

  it('moves a card between decks on merge when that edit is newer', () => {
    const local = makeCard({ deck: '' });
    const remote = { ...local, deck: 'Slang', updated: local.updated + 10 };
    const plan = planMerge([local], [], { cards: [remote], reviewLogs: [] }, 0.9);
    expect(plan.cards.find((c) => c.id === local.id)?.deck).toBe('Slang');
  });
});

describe('managing decks', () => {
  it('renames a deck by moving its cards, as a content edit', async () => {
    const store = new Store(new GoiDB(`decks-m-${Math.random()}`));
    await store.load(T0);
    let changes = 0;
    store.onChange = () => changes++;
    const a = await store.addCard({ word: 'エモい', deck: 'Slang' }, T0);
    const b = await store.addCard({ word: '稟議' }, T0);
    const moved = await store.setDeck([a.id, b.id], 'Slang 2025', T0 + 5);
    expect(moved).toBe(2);
    expect(store.cards.get(a.id)!.deck).toBe('Slang 2025');
    expect(store.cards.get(a.id)!.updated).toBeGreaterThan(a.updated);
    expect(await store.setDeck([a.id], 'Slang 2025', T0 + 6)).toBe(0);
    const removed = await store.deleteCards([a.id], T0 + 7);
    expect(removed).toBe(1);
    expect(store.cards.get(a.id)!.deleted).toBe(true);
    expect(changes).toBe(4); // two adds, one move, one delete
  });
});
