import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildDict } from '../scripts/build-dict.mjs';
import type { DictManifest } from '../src/dict/entry';
import { cardFields, lookupWord } from '../src/dict/lookup';
import { GoiDB } from '../src/db';
import { DictDB, findEntries, installLines, installState, streamLines } from '../src/dictdb';
import { Store } from '../src/store';
import sample from './fixtures/dict-sample.json';
import { T0 } from './helpers';

const { text, entries, examples } = buildDict(sample);
const manifest: DictManifest = { version: 'test-1', file: 'x.ndjson.gz', bytes: 0, rawBytes: text.length, entries, examples, source: 'fixture', fixture: true };
let n = 0;

function bytes(gzip: boolean): ReadableStream<Uint8Array> {
  const raw = new Blob([text]).stream() as ReadableStream<Uint8Array>;
  return gzip ? raw.pipeThrough(new CompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>) : raw;
}

describe('the on-device dictionary', () => {
  it.each([true, false])('installs from a stream (gzip %s) and looks words up', async (gzip) => {
    const db = new DictDB(`dict-${++n}`);
    const seen: number[] = [];
    const count = await installLines(db, manifest, streamLines(bytes(gzip)), (c) => seen.push(c), T0);
    expect(count).toBe(entries);
    expect(seen.at(-1)).toBe(entries);
    expect(await installState(db)).toMatchObject({ version: 'test-1', entries, complete: true, installedAt: T0, fixture: true });
    const found = await lookupWord('承りました', (terms) => findEntries(db, terms));
    expect(cardFields(found[0]!)).toMatchObject({ word: '承る', reading: 'うけたまわる' });
    const kana = await findEntries(db, ['やばい']);
    expect(kana.map((e) => e.k[0])).toEqual(['矢場い']);
  });

  it('leaves an interrupted install marked incomplete', async () => {
    const db = new DictDB(`dict-${++n}`);
    async function* broken() {
      yield text.split('\n')[0]!;
      throw new Error('connection lost');
    }
    await expect(installLines(db, manifest, broken())).rejects.toThrow('connection lost');
    expect((await installState(db))?.complete).toBe(false);
  });

  it('refuses an empty file', async () => {
    const db = new DictDB(`dict-${++n}`);
    async function* empty() {}
    await expect(installLines(db, manifest, empty())).rejects.toThrow(/empty/);
    expect((await installState(db))?.complete).toBe(false);
  });

  it('never touches the deck, its backup fingerprint or its backups', async () => {
    const store = new Store(new GoiDB(`deck-${++n}`));
    await store.load(T0);
    await store.addCard({ word: '稟議', reading: 'りんぎ', meaning_en: 'circular' }, T0);
    const markBefore = await store.mark();
    const exportBefore = await store.export(T0);

    // Same database name as the app uses for the dictionary, next to the deck.
    const db = new DictDB(`dict-${++n}`);
    await installLines(db, manifest, streamLines(bytes(true)), undefined, T0);

    expect(await store.mark()).toBe(markBefore);
    const exportAfter = await store.export(T0);
    expect(JSON.stringify(exportAfter)).toBe(JSON.stringify(exportBefore));
    expect(JSON.stringify(exportAfter)).not.toContain('うけたまわる');
    expect(store.cards.size).toBe(1);
  });
});
