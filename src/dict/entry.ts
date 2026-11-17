/**
 * The compact dictionary entry, as written by scripts/build-dict.mjs (one
 * JSON object per line) and stored in the on-device dictionary database.
 * Short keys keep the download and the database small.
 */
export interface DictSense {
  /** English glosses. */
  g: string[];
  /** Parts of speech, JMdict codes (v5r, vt, adj-i, n, vs, …). */
  p?: string[];
  /** Misc tags: register and usage (hon, hum, pol, col, sl, uk, arch, …). */
  m?: string[];
  /** Fields of application (bus, comp, law, …). */
  f?: string[];
  /** Dialects (ksb, …). */
  d?: string[];
  /** Short usage notes. */
  n?: string[];
  /** Only for these kanji forms (absent: all). */
  ak?: string[];
  /** Only for these readings (absent: all). */
  ar?: string[];
  /** Example sentences, [Japanese, English]. */
  x?: [string, string][];
}

export interface DictEntry {
  /** JMdict sequence number. */
  i: number;
  /** Kanji forms, in dictionary order. */
  k: string[];
  /** Readings (kana forms), in dictionary order, irregular or search-only ones last. */
  r: string[];
  /** Readings that apply only to some kanji forms: reading → kanji forms. */
  rk?: Record<string, string[]>;
  /** Irregular, outdated or search-only spellings (kanji or kana): never chosen as the reading. */
  rx?: string[];
  /** 1 when JMdict marks any form as common. */
  c?: 1;
  s: DictSense[];
}

export interface DictManifest {
  /** Identifies this build of the data; a different value means a newer download exists. */
  version: string;
  /** Data file, relative to the manifest. */
  file: string;
  /** Size of the data file in bytes, as served (gzip). */
  bytes: number;
  /** Size of the uncompressed data in bytes. */
  rawBytes: number;
  entries: number;
  examples: number;
  /** Where the data came from, e.g. "jmdict-simplified 3.6.2+20261116213322 (JMdict 2026-11-16)". */
  source: string;
  /** True for the small hand-written test fixture. */
  fixture?: boolean;
}
