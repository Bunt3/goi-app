/**
 * Furigana for the target word only. The reading is aligned to the word by
 * peeling off kana the two have in common at either end (okurigana), so
 * 承る/うけたまわる puts うけたまわ over 承 and leaves る alone. The same
 * kanji core is then used to find a conjugated form inside an example
 * sentence (承りました). No dictionary, no full-sentence analysis.
 */

const KANA = /^[぀-ヿー]$/;

const isKana = (ch: string) => KANA.test(ch);

/** Katakana → hiragana, for comparing word kana with the reading. */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export interface WordParts {
  /** Kana before the part that needs furigana. */
  prefix: string;
  /** The part that gets furigana ('' if the word is all kana). */
  core: string;
  coreReading: string;
  /** Kana after it (okurigana). */
  suffix: string;
}

export function splitWord(word: string, reading: string): WordParts {
  const w = [...word.trim()];
  const r = [...toHiragana(reading.trim()).replace(/\s+/g, '')];
  if (w.length === 0 || r.length === 0 || toHiragana(w.join('')) === r.join('')) {
    return { prefix: word.trim(), core: '', coreReading: '', suffix: '' };
  }
  let start = 0;
  let end = w.length;
  let rStart = 0;
  let rEnd = r.length;
  // Each step must leave at least one reading character for the remaining core.
  while (end - start > 1 && rEnd - rStart > 1 && isKana(w[end - 1]!) && toHiragana(w[end - 1]!) === r[rEnd - 1]) {
    end--;
    rEnd--;
  }
  while (end - start > 1 && rEnd - rStart > 1 && isKana(w[start]!) && toHiragana(w[start]!) === r[rStart]) {
    start++;
    rStart++;
  }
  return {
    prefix: w.slice(0, start).join(''),
    core: w.slice(start, end).join(''),
    coreReading: r.slice(rStart, rEnd).join(''),
    suffix: w.slice(end).join(''),
  };
}

export interface TargetMatch {
  start: number;
  end: number;
  /** How the matched span splits into plain kana and the furigana'd core. */
  parts: WordParts;
}

/** Locate the target word (or its conjugated stem) in an example sentence. */
export function findTarget(example: string, word: string, reading: string): TargetMatch | null {
  const w = word.trim();
  if (!w || !example) return null;
  const parts = splitWord(w, reading);
  const exact = example.indexOf(w);
  if (exact !== -1) return { start: exact, end: exact + w.length, parts };
  if (!parts.core) {
    // All-kana word: allow a conjugated ending by matching all but the last character.
    const stem = [...w].slice(0, -1).join('');
    if ([...stem].length >= 2) {
      const at = example.indexOf(stem);
      if (at !== -1) return { start: at, end: at + stem.length, parts: { prefix: stem, core: '', coreReading: '', suffix: '' } };
    }
    return null;
  }
  const stem = parts.prefix + parts.core;
  let at = example.indexOf(stem);
  if (at !== -1) return { start: at, end: at + stem.length, parts: { ...parts, suffix: '' } };
  at = example.indexOf(parts.core);
  if (at !== -1) return { start: at, end: at + parts.core.length, parts: { ...parts, prefix: '', suffix: '' } };
  return null;
}

function ruby(base: string, reading: string): HTMLElement {
  const el = document.createElement('ruby');
  el.append(base);
  const rt = document.createElement('rt');
  rt.textContent = reading;
  el.append(rt);
  return el;
}

function partsToNodes(parts: WordParts, furigana: boolean): (Node | string)[] {
  if (!parts.core) return [parts.prefix + parts.suffix];
  return [parts.prefix, furigana && parts.coreReading ? ruby(parts.core, parts.coreReading) : parts.core, parts.suffix].filter(
    (x) => x !== '',
  );
}

/** The word on its own, with furigana over its kanji part when enabled. */
export function wordNode(word: string, reading: string, furigana: boolean): HTMLElement {
  const span = document.createElement('span');
  span.append(...partsToNodes(splitWord(word, reading), furigana));
  return span;
}

export type ExampleMode = 'plain' | 'highlight' | 'blank';

/**
 * The example sentence with the target word highlighted (optionally with
 * furigana) or blanked out. Returns null in blank mode when the word can't
 * be located, so the caller can avoid showing a sentence that gives the answer away.
 */
export function exampleNode(
  example: string,
  word: string,
  reading: string,
  mode: ExampleMode,
  furigana: boolean,
): HTMLElement | null {
  const span = document.createElement('span');
  const match = mode === 'plain' ? null : findTarget(example, word, reading);
  if (!match) {
    if (mode === 'blank') return null;
    span.textContent = example;
    return span;
  }
  const mark = document.createElement('mark');
  if (mode === 'blank') {
    mark.className = 'blank';
    mark.textContent = '＿＿＿';
  } else {
    mark.append(...partsToNodes(match.parts, furigana));
  }
  span.append(example.slice(0, match.start), mark, example.slice(match.end));
  return span;
}
