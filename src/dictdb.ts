/**
 * The offline dictionary's own IndexedDB database ('goi-dict'). Kept apart
 * from the deck on purpose: it is never read by backups, merges or deckMark,
 * and deleting it loses nothing that can't be downloaded again.
 * Used from the main thread for lookups and from the install worker.
 */
import Dexie, { type Table } from 'dexie';
import type { DictEntry, DictManifest } from './dict/entry';

export interface InstalledDict {
  version: string;
  source: string;
  entries: number;
  examples: number;
  fixture: boolean;
  /** Epoch ms. */
  installedAt: number;
  /** False while an install is running or after one was interrupted. */
  complete: boolean;
}

interface MetaRow {
  key: string;
  value: InstalledDict;
}

export const DICT_DB_NAME = 'goi-dict';

export class DictDB extends Dexie {
  entries!: Table<DictEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = DICT_DB_NAME) {
    super(name);
    this.version(1).stores({ entries: 'i, *k, *r', meta: 'key' });
  }
}

/** What is installed, complete or not; null if nothing. */
export async function installState(db: DictDB): Promise<InstalledDict | null> {
  return (await db.meta.get('installed'))?.value ?? null;
}

const BATCH = 2000;

/**
 * Replace the dictionary with the entries in `lines` (one JSON entry per line).
 * Marked complete only at the end, so an interrupted install is recognisable.
 */
export async function installLines(
  db: DictDB,
  manifest: DictManifest,
  lines: AsyncIterable<string>,
  onProgress: (entries: number) => void = () => undefined,
  now = Date.now(),
): Promise<number> {
  const info: InstalledDict = {
    version: manifest.version,
    source: manifest.source,
    entries: 0,
    examples: manifest.examples,
    fixture: manifest.fixture === true,
    installedAt: now,
    complete: false,
  };
  await db.transaction('rw', db.entries, db.meta, async () => {
    await db.entries.clear();
    await db.meta.put({ key: 'installed', value: info });
  });
  let batch: DictEntry[] = [];
  let count = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line) as DictEntry);
    if (batch.length >= BATCH) {
      await db.entries.bulkPut(batch);
      count += batch.length;
      batch = [];
      onProgress(count);
    }
  }
  if (batch.length) await db.entries.bulkPut(batch);
  count += batch.length;
  if (count === 0) throw new Error('the dictionary file was empty');
  await db.meta.put({ key: 'installed', value: { ...info, entries: count, complete: true } });
  onProgress(count);
  return count;
}

/** Entries having any of the terms as a kanji form or a reading. */
export async function findEntries(db: DictDB, terms: string[]): Promise<DictEntry[]> {
  if (terms.length === 0) return [];
  const [byKanji, byReading] = await Promise.all([db.entries.where('k').anyOf(terms).toArray(), db.entries.where('r').anyOf(terms).toArray()]);
  const out = new Map<number, DictEntry>();
  for (const e of [...byKanji, ...byReading]) out.set(e.i, e);
  return [...out.values()];
}

/** Split a byte stream into text lines. Gzip is undone here unless the server already did it. */
export async function* streamLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const first = await reader.read();
  const head = first.value;
  const gzipped = !!head && head[0] === 0x1f && head[1] === 0x8b;
  let bytes: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
    start(c) {
      if (head) c.enqueue(head);
      if (first.done) c.close();
    },
    async pull(c) {
      const r = await reader.read();
      if (r.done) c.close();
      else c.enqueue(r.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  if (gzipped) bytes = bytes.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
  const text = bytes.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
  let rest = '';
  for (;;) {
    const { value, done } = await text.read();
    if (done) break;
    rest += value;
    const parts = rest.split('\n');
    rest = parts.pop()!;
    yield* parts;
  }
  if (rest) yield rest;
}
