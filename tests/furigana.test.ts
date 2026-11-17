import { describe, expect, it } from 'vitest';
import { findTarget, splitWord } from '../src/furigana';

describe('target-word furigana', () => {
  it('peels okurigana off the reading', () => {
    expect(splitWord('承る', 'うけたまわる')).toEqual({ prefix: '', core: '承', coreReading: 'うけたまわ', suffix: 'る' });
    expect(splitWord('お手数', 'おてすう')).toEqual({ prefix: 'お', core: '手数', coreReading: 'てすう', suffix: '' });
    expect(splitWord('差し支えない', 'さしつかえない')).toEqual({
      prefix: '',
      core: '差し支',
      coreReading: 'さしつか',
      suffix: 'えない',
    });
    expect(splitWord('稟議', 'りんぎ')).toEqual({ prefix: '', core: '稟議', coreReading: 'りんぎ', suffix: '' });
  });

  it('needs no furigana for kana-only words', () => {
    expect(splitWord('あいにく', 'あいにく').core).toBe('');
    expect(splitWord('リスケ', 'りすけ').core).toBe('');
  });

  it('never strips the reading down to nothing', () => {
    expect(splitWord('気', 'き')).toEqual({ prefix: '', core: '気', coreReading: 'き', suffix: '' });
    expect(splitWord('見る', 'みる')).toEqual({ prefix: '', core: '見', coreReading: 'み', suffix: 'る' });
  });

  it('finds the exact word in a sentence', () => {
    const m = findTarget('稟議を上げる必要がある。', '稟議', 'りんぎ')!;
    expect([m.start, m.end]).toEqual([0, 2]);
  });

  it('finds a conjugated form by its kanji stem', () => {
    const m = findTarget('ご注文を承りました。', '承る', 'うけたまわる')!;
    expect('ご注文を承りました。'.slice(m.start, m.end)).toBe('承');
    expect(m.parts.coreReading).toBe('うけたまわ');
    expect(m.parts.suffix).toBe('');
  });

  it('returns null when the word is not in the sentence', () => {
    expect(findTarget('別の文です。', '稟議', 'りんぎ')).toBeNull();
    expect(findTarget('', '稟議', 'りんぎ')).toBeNull();
  });
});
