import { describe, expect, it } from 'vitest';
import type { PackEntry } from '../src/data/packs/common';
import { PACKS, packCards } from '../src/data/packs/index';
import { findTarget } from '../src/furigana';
import { LEGACY_UNVERIFIED_TAG, REGISTERS, SEED_DECK, type Card } from '../src/types';
import { uuidFromName } from '../src/util';
import { T0, makeCard } from './helpers';

const loaded = new Map<string, PackEntry[]>();
for (const p of PACKS) loaded.set(p.id, await p.load());

describe.each(PACKS.map((p) => [p.id, p] as const))('starter deck %s', (id, pack) => {
  const entries = loaded.get(id)!;

  it('has a sensible number of cards', () => {
    expect(entries.length).toBeGreaterThanOrEqual(60);
    expect(entries.length).toBeLessThanOrEqual(200);
  });

  it('has no duplicate words', () => {
    const keys = entries.map((e) => `${e.word}|${e.reading}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('has complete, well-formed entries', () => {
    for (const e of entries) {
      expect(e.word, e.word).not.toBe('');
      expect(e.reading, e.word).toMatch(/^[぀-ゟー]+$/);
      expect(e.meaning_en, e.word).not.toBe('');
      expect(e.example_ja, e.word).toMatch(/[。？！]$/);
      expect(e.example_en, e.word).not.toBe('');
      expect(e.tags.length, e.word).toBe(1);
      if (e.register) expect(REGISTERS).toContain(e.register);
    }
  });

  it('every example contains its word, so highlighting and blanking work', () => {
    expect(entries.filter((e) => !findTarget(e.example_ja, e.word, e.reading)).map((e) => e.word)).toEqual([]);
  });

  it('goes into its own deck', () => {
    expect(pack.deck).not.toBe('');
    if (id === 'workplace') expect(pack.deck).toBe(SEED_DECK);
  });
});

describe('starter decks together', () => {
  it('never teach the same word twice across decks', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, entries] of loaded) {
      for (const e of entries) {
        const k = `${e.word}|${e.reading}`;
        if (seen.has(k)) clashes.push(`${e.word} (${seen.get(k)} and ${id})`);
        seen.set(k, id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keeps the original seed ids, so loading on a second device merges', async () => {
    const workplace = PACKS.find((p) => p.id === 'workplace')!;
    const first = loaded.get('workplace')![0]!;
    const { fresh } = await packCards(workplace, [first], new Map(), uuidFromName, T0);
    expect(fresh[0]!.id).toBe(await uuidFromName(`seed:${first.word}:${first.reading}`));
    expect(fresh[0]!.source).toBe('seed deck');
  });

  it('loads into the deck, records the source, adds no unverified tag, and skips what is already there', async () => {
    const slang = PACKS.find((p) => p.id === 'slang')!;
    const entries = loaded.get('slang')!.slice(0, 5);
    const own = makeCard({ word: entries[1]!.word, reading: entries[1]!.reading });
    const existing = new Map<string, Card>([[own.id, own]]);
    const first = await packCards(slang, entries, existing, uuidFromName, T0);
    expect(first.fresh).toHaveLength(4);
    expect(first.skipped).toBe(1);
    const c = first.fresh[0]!;
    expect(c.deck).toBe('Modern slang');
    expect(c.tags).not.toContain(LEGACY_UNVERIFIED_TAG);
    expect(c.check).toBeNull();
    expect(c.source).toMatch(/^Modern slang starter deck · documented: /);
    for (const card of first.fresh) existing.set(card.id, card);
    const again = await packCards(slang, entries, existing, uuidFromName, T0);
    expect(again.fresh).toHaveLength(0);
    // Deleting a pack card on purpose keeps it deleted when the pack is loaded again.
    existing.set(c.id, { ...c, deleted: true });
    expect((await packCards(slang, entries, existing, uuidFromName, T0)).fresh).toHaveLength(0);
  });
});
