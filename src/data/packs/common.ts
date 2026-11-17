import type { Register } from '../../types';

/** One card of a starter deck. */
export interface PackEntry {
  word: string;
  /** Hiragana. */
  reading: string;
  meaning_en: string;
  /** Contains the word (or its stem), so highlighting and blanking work. */
  example_ja: string;
  example_en: string;
  tags: string[];
  register: Register | null;
  /** Where the term is documented, or '' when no source was checked. */
  source: string;
}

/** [word, reading, meaning, example, translation, register, source] */
export type PackRow = [string, string, string, string, string, Register | null, string];

/** Interleave groups so a day's new cards aren't all from one group; each group's name becomes a tag. */
export function interleave(groups: [tag: string, rows: PackRow[]][]): PackEntry[] {
  const out: PackEntry[] = [];
  const longest = Math.max(...groups.map(([, rows]) => rows.length));
  for (let i = 0; i < longest; i++) {
    for (const [tag, rows] of groups) {
      const row = rows[i];
      if (!row) continue;
      const [word, reading, meaning_en, example_ja, example_en, register, source] = row;
      out.push({ word, reading, meaning_en, example_ja, example_en, tags: [tag], register, source });
    }
  }
  return out;
}
