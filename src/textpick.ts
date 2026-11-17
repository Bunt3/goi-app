/**
 * Picking a word or phrase out of running Japanese text: splitting text
 * into tappable pieces, and checking a selection against the deck.
 * Pure: no DOM, no storage.
 */
import { splitWord } from './furigana';
import type { Card } from './types';

export interface Token {
  text: string;
  start: number;
  end: number;
  /** False for punctuation and whitespace, which can't start a selection. */
  word: boolean;
}

const WORD_CHAR = /[\p{L}\p{N}々〆ー]/u;
const HIRAGANA_TAIL = /[ぁ-ゟ]+$/;
const HAS_KANJI = /[一-鿿々]/;

type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'word' },
) => { segment(text: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> };

function byCharacter(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  for (const ch of text) {
    out.push({ text: ch, start: i, end: i + ch.length, word: WORD_CHAR.test(ch) });
    i += ch.length;
  }
  return out;
}

/**
 * Split text into pieces. 'word' uses the browser's built-in Japanese word
 * breaker (Intl.Segmenter); it has no dictionary of ours behind it, so its
 * boundaries are a starting point, not an authority. 'char' is the fallback
 * for when a boundary lands in the wrong place.
 */
export function segment(text: string, mode: 'word' | 'char' = 'word'): Token[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (mode === 'char' || !Segmenter) return byCharacter(text);
  const out: Token[] = [];
  for (const s of new Segmenter('ja', { granularity: 'word' }).segment(text)) {
    out.push({
      text: s.segment,
      start: s.index,
      end: s.index + s.segment.length,
      word: s.isWordLike ?? WORD_CHAR.test(s.segment),
    });
  }
  return out;
}

/** The sentence (or line) containing the span, for use as the new card's example. */
export function sentenceAround(text: string, start: number, end: number): string {
  const isBreak = (ch: string) => ch === '\n' || ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?';
  let a = start;
  while (a > 0 && !isBreak(text[a - 1]!)) a--;
  let b = end;
  while (b < text.length && !isBreak(text[b]!)) b++;
  if (b < text.length && text[b] !== '\n') b++; // keep the closing 。
  return text.slice(a, b).trim();
}

/** A word with its okurigana removed: 承りました → 承, 取り次ぎ → 取り次. */
export function stemOf(text: string): string {
  return text.replace(HIRAGANA_TAIL, '');
}

export interface DeckLookup {
  /** Cards whose word is exactly the selection. */
  exact: Card[];
  /** Cards that look like the same word in another form, or that contain / are contained in the selection. */
  related: Card[];
}

/**
 * Is this selection already in the deck? Exact means the same string.
 * Related covers a conjugated form (承り ↔ 承る, matched on the kanji stem)
 * and phrases where one starts with the other (稟議 ↔ 稟議書).
 */
export function lookup(cards: Iterable<Card>, selection: string): DeckLookup {
  const sel = selection.trim();
  const result: DeckLookup = { exact: [], related: [] };
  if (!sel) return result;
  const selStem = stemOf(sel);
  for (const card of cards) {
    if (card.deleted) continue;
    const word = card.word.trim();
    if (!word) continue;
    if (word === sel) {
      result.exact.push(card);
      continue;
    }
    const parts = splitWord(word, card.reading);
    const cardStem = parts.core ? parts.prefix + parts.core : '';
    const sameStem = cardStem !== '' && HAS_KANJI.test(selStem) && (selStem === cardStem || selStem === stemOf(word));
    const prefix = [...sel].length >= 2 && [...word].length >= 2 && (word.startsWith(sel) || sel.startsWith(word));
    if (sameStem || prefix) result.related.push(card);
  }
  return result;
}

/** Tidy raw text from OCR or a paste before it is shown for picking. */
export function cleanCapturedText(raw: string): string {
  const JP = '[\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef]';
  return (
    raw
      .replace(/\r\n?/g, '\n')
      // OCR engines put spaces between Japanese characters; real Japanese text has none.
      .replace(new RegExp(`(?<=${JP})[ \\t\\u3000]+(?=${JP})`, 'g'), '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n')
  );
}
