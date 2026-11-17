import { describe, expect, it } from 'vitest';
import { SEED } from '../src/data/seed';
import { findTarget } from '../src/furigana';
import { DEFAULT_TAGS, REGISTERS } from '../src/types';

describe('seed deck', () => {
  it('has about 150 cards', () => {
    expect(SEED.length).toBeGreaterThanOrEqual(140);
    expect(SEED.length).toBeLessThanOrEqual(190);
  });

  it('has no duplicate words', () => {
    const keys = SEED.map((e) => `${e.word}|${e.reading}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has complete, well-formed entries', () => {
    for (const e of SEED) {
      expect(e.word, e.word).not.toBe('');
      expect(e.reading, e.word).toMatch(/^[぀-ゟー]+$/); // hiragana only
      expect(e.meaning_en, e.word).not.toBe('');
      expect(e.example_ja, e.word).toMatch(/[。？]$/);
      expect(e.example_en, e.word).not.toBe('');
      expect(e.tags.every((t) => (DEFAULT_TAGS as readonly string[]).includes(t)), e.word).toBe(true);
      if (e.register) expect(REGISTERS).toContain(e.register);
    }
  });

  it('every example contains its target word, so highlighting and blanking work', () => {
    const missing = SEED.filter((e) => !findTarget(e.example_ja, e.word, e.reading)).map((e) => e.word);
    expect(missing).toEqual([]);
  });

  it('is interleaved across topics', () => {
    const firstSix = SEED.slice(0, 6).map((e) => e.tags[0]);
    expect(new Set(firstSix).size).toBe(6);
  });
});
