import { describe, expect, it } from 'vitest';
import { cleanCapturedText, lookup, segment, sentenceAround, stemOf } from '../src/textpick';
import { makeCard } from './helpers';

describe('splitting text into tappable pieces', () => {
  const text = '担当の者に取り次ぎますので、少々お待ちください。';

  it('covers the text exactly, in order, in both modes', () => {
    for (const mode of ['word', 'char'] as const) {
      const tokens = segment(text, mode);
      expect(tokens.map((t) => t.text).join('')).toBe(text);
      let at = 0;
      for (const t of tokens) {
        expect(t.start).toBe(at);
        expect(text.slice(t.start, t.end)).toBe(t.text);
        at = t.end;
      }
    }
  });

  it('marks punctuation as not selectable', () => {
    const tokens = segment(text, 'word');
    expect(tokens.find((t) => t.text === '、')?.word).toBe(false);
    expect(tokens.find((t) => t.text === '。')?.word).toBe(false);
    expect(tokens.some((t) => t.word && t.text.includes('担当'))).toBe(true);
  });

  it('word mode gives fewer, larger pieces than character mode', () => {
    expect(segment(text, 'word').length).toBeLessThan(segment(text, 'char').length);
    expect(segment(text, 'char').every((t) => [...t.text].length === 1)).toBe(true);
  });

  it('handles empty text', () => {
    expect(segment('')).toEqual([]);
  });
});

describe('finding the sentence around a selection', () => {
  const text = '平素よりお世話になっております。標記の件につきまして、ご連絡いたします。\n資料を添付いたしますので、ご査収ください';

  it('returns the sentence with its closing punctuation', () => {
    const at = text.indexOf('標記');
    expect(sentenceAround(text, at, at + 2)).toBe('標記の件につきまして、ご連絡いたします。');
  });

  it('stops at line breaks and handles a last line with no full stop', () => {
    const at = text.indexOf('査収');
    expect(sentenceAround(text, at, at + 2)).toBe('資料を添付いたしますので、ご査収ください');
    expect(sentenceAround(text, 0, 2)).toBe('平素よりお世話になっております。');
  });
});

describe('checking a selection against the deck', () => {
  const uketamawaru = makeCard({ word: '承る', reading: 'うけたまわる' });
  const ringi = makeCard({ word: '稟議', reading: 'りんぎ' });
  const osore = makeCard({ word: '恐れ入りますが', reading: 'おそれいりますが' });
  const sakihodo = makeCard({ word: '先ほど', reading: 'さきほど' });
  const ainiku = makeCard({ word: 'あいにく', reading: 'あいにく' });
  const gone = makeCard({ word: '削除済み', reading: 'さくじょずみ', deleted: true });
  const deck = [uketamawaru, ringi, osore, sakihodo, ainiku, gone];
  const words = (cards: { word: string }[]) => cards.map((c) => c.word);

  it('reports an exact match', () => {
    expect(words(lookup(deck, '稟議').exact)).toEqual(['稟議']);
    expect(words(lookup(deck, ' あいにく ').exact)).toEqual(['あいにく']);
  });

  it('recognises a conjugated form of a deck word as related, not exact', () => {
    const r = lookup(deck, '承り');
    expect(r.exact).toEqual([]);
    expect(words(r.related)).toEqual(['承る']);
    expect(words(lookup(deck, '承りました').related)).toEqual(['承る']);
  });

  it('relates a longer or shorter phrase that starts the same way', () => {
    expect(words(lookup(deck, '稟議書').related)).toEqual(['稟議']);
    expect(words(lookup(deck, '恐れ入ります').related)).toEqual(['恐れ入りますが']);
  });

  it('does not match on a shared single kanji inside a different word', () => {
    expect(lookup(deck, '取引先')).toEqual({ exact: [], related: [] }); // 先ほど shares 先 only
    expect(lookup(deck, '承認')).toEqual({ exact: [], related: [] }); // 承る shares 承 only
  });

  it('finds nothing for a new word, an empty selection, or a deleted card', () => {
    expect(lookup(deck, '齟齬')).toEqual({ exact: [], related: [] });
    expect(lookup(deck, '   ')).toEqual({ exact: [], related: [] });
    expect(lookup(deck, '削除済み')).toEqual({ exact: [], related: [] });
  });

  it('strips okurigana to a stem', () => {
    expect(stemOf('承りました')).toBe('承');
    expect(stemOf('取り次ぎ')).toBe('取り次');
    expect(stemOf('稟議')).toBe('稟議');
  });
});

describe('tidying captured text', () => {
  it('removes the spaces OCR puts between Japanese characters', () => {
    expect(cleanCapturedText('稟 議 を 上 げ る 。')).toBe('稟議を上げる。');
    expect(cleanCapturedText('ご 査収　ください')).toBe('ご査収ください');
  });

  it('keeps spaces that belong to Latin text', () => {
    expect(cleanCapturedText('Windows 11 の 設定')).toBe('Windows 11 の設定');
  });

  it('drops blank lines and trims each line', () => {
    expect(cleanCapturedText('  一行目  \r\n\r\n\n 二行目\n')).toBe('一行目\n二行目');
  });
});
