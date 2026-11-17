import { describe, expect, it } from 'vitest';
import { buildDict } from '../scripts/build-dict.mjs';
import { classesOf, deinflect, W } from '../src/dict/deinflect';
import type { DictEntry } from '../src/dict/entry';
import { cardFields, labelsFor, lookupPlan, lookupWord, matchEntries, readingFor, tagsFor } from '../src/dict/lookup';
import { toHiragana } from '../src/furigana';
import { AUTO_TAG } from '../src/types';
import sample from './fixtures/dict-sample.json';

const built = buildDict(sample);
const ENTRIES: DictEntry[] = built.text.trim().split('\n').map((l) => JSON.parse(l));

/** Stand-in for the IndexedDB query: entries with any of the terms as a kanji form or reading. */
async function fetchEntries(terms: string[]): Promise<DictEntry[]> {
  const want = new Set(terms);
  return ENTRIES.filter((e) => e.k.some((k) => want.has(k)) || e.r.some((r) => want.has(r)));
}
const look = (text: string) => lookupWord(text, fetchEntries);
const first = async (text: string) => (await look(text))[0];

describe('building the dictionary file', () => {
  it('keeps every entry with English and the examples', () => {
    expect(built.entries).toBe(sample.words.length);
    expect(built.examples).toBe(4);
    const uke = ENTRIES.find((e) => e.k[0] === '承る')!;
    expect(uke.c).toBe(1);
    expect(uke.s[1]!.x).toEqual([['ご注文を承りました。', 'We have received your order.']]);
    expect(uke.s[0]!.m).toEqual(['hum']);
  });

  it('drops examples when asked to, keeping every word', () => {
    const small = buildDict(sample, 0);
    expect(small.entries).toBe(built.entries);
    expect(small.examples).toBe(0);
    expect(small.text.length).toBeLessThan(built.text.length);
  });

  it('carries a missing part of speech forward and orders odd readings last', () => {
    const word = {
      id: '1',
      kanji: [{ common: false, text: '漢', tags: [] }],
      kana: [
        { common: false, text: 'へん', tags: ['ik'], appliesToKanji: ['*'] },
        { common: true, text: 'かん', tags: [], appliesToKanji: ['*'] },
        { common: false, text: 'から', tags: [], appliesToKanji: [] },
      ],
      sense: [
        { partOfSpeech: ['n'], gloss: [{ lang: 'eng', text: 'a' }] },
        { partOfSpeech: [], gloss: [{ lang: 'eng', text: 'b' }], examples: [{ sentences: [{ lang: 'jpn', text: 'あ' }, { lang: 'eng', text: 'A' }] }] },
      ],
    };
    const e = buildDict({ words: [word] }).text.trim();
    const entry: DictEntry = JSON.parse(e);
    expect(entry.r).toEqual(['かん', 'から', 'へん']);
    expect(entry.rx).toEqual(['へん']);
    expect(entry.rk).toEqual({ から: [] });
    expect(entry.s[1]!.p).toEqual(['n']);
    expect(entry.s[1]!.x).toEqual([['あ', 'A']]);
    expect(readingFor({ entry, term: '漢', reasons: [], byKanji: true })).toBe('かん');
  });

  it('rejects a file that is not jmdict-simplified', () => {
    expect(() => buildDict({ hello: 1 })).toThrow(/words/);
  });
});

describe('deinflection', () => {
  const forms = (text: string) => deinflect(text).map((c) => `${c.term}:${c.cls}`);
  const has = (text: string, term: string, cls: number) => expect(forms(text)).toContain(`${term}:${cls}`);

  it.each([
    ['承りました', '承る', W.V5],
    ['承ります', '承る', W.V5],
    ['承り', '承る', W.V5],
    ['承らなかった', '承る', W.V5],
    ['承っております', '承る', W.V5],
    ['取り次ぎます', '取り次ぐ', W.V5],
    ['待って', '待つ', W.V5],
    ['待たせる', '待つ', W.V5],
    ['待たされた', '待つ', W.V5],
    ['書けない', '書く', W.V5],
    ['書かれました', '書く', W.V5],
    ['行った', '行く', W.V5],
    ['飲んじゃった', '飲む', W.V5],
    ['知らねえ', '知る', W.V5],
    ['知らん', '知る', W.V5],
    ['食べちゃった', '食べる', W.V1],
    ['食べてる', '食べる', W.V1],
    ['食べれる', '食べる', W.V1],
    ['食べさせられた', '食べる', W.V1],
    ['食べたかった', '食べる', W.V1],
    ['食べなきゃ', '食べる', W.V1],
    ['寝ないで', '寝る', W.V1],
    ['高くなかった', '高い', W.ADJ],
    ['高くて', '高い', W.ADJ],
    ['高ければ', '高い', W.ADJ],
    ['高くなりました', '高い', W.ADJ],
    ['よかった', 'よい', W.ADJ],
    ['ヤバかった', 'ヤバい', W.ADJ],
    ['説明しました', '説明', W.VSN],
    ['確認できません', '確認', W.VSN],
    ['来ない', '来る', W.VK],
    ['きました', 'くる', W.VK],
    ['いらっしゃいます', 'いらっしゃる', W.V5],
    ['ググった', 'ググる', W.V5],
    ['ウケる', 'ウケる', W.ANY],
  ])('%s → %s', (text, term, cls) => {
    if (cls === W.ANY) expect(deinflect(text)[0]).toEqual({ term, cls, reasons: [] });
    else has(text, term, cls);
  });

  it('puts the text itself first, unchanged', () => {
    expect(deinflect('会議')[0]).toEqual({ term: '会議', cls: W.ANY, reasons: [] });
  });

  it('names the steps, nearest the dictionary form first', () => {
    const c = deinflect('承りました').find((x) => x.term === '承る' && x.cls === W.V5)!;
    expect(c.reasons).toEqual(['polite', 'past']);
  });

  it('maps parts of speech to word classes', () => {
    expect(classesOf(['v5r', 'vt'])).toBe(W.V5);
    expect(classesOf(['v5aru'])).toBe(W.V5);
    expect(classesOf(['v1'])).toBe(W.V1);
    expect(classesOf(['n', 'vs'])).toBe(W.VSN);
    expect(classesOf(['vs-i'])).toBe(W.VS);
    expect(classesOf(['adj-ix'])).toBe(W.ADJ);
    expect(classesOf(['n', 'adv'])).toBe(0);
  });

  it('stays fast on long input', () => {
    const t0 = performance.now();
    deinflect('食べさせられたくなかったでしょうけれども');
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('looking words up', () => {
  it('finds a conjugated humble verb with its reading, meaning and register', async () => {
    const m = await first('承りました');
    expect(m.term).toBe('承る');
    const f = cardFields(m);
    expect(f.word).toBe('承る');
    expect(f.reading).toBe('うけたまわる');
    expect(f.meaning_en).toMatch(/^1\. to hear; .* 2\. to receive \(an order\)/);
    expect(f.register).toBe('謙譲語');
    expect(f.tags).toContain(AUTO_TAG);
    expect(f.example_ja).toBe('ご注文を承りました。');
  });

  it('finds an i-adjective through a negative past', async () => {
    const f = cardFields(await first('高くなかった'));
    expect([f.word, f.reading]).toEqual(['高い', 'たかい']);
    expect(f.meaning_en).toContain('expensive');
  });

  it('finds a する noun from a polite potential', async () => {
    const m = await first('確認できます');
    expect(m.entry.k[0]).toBe('確認');
    expect(m.reasons).toEqual(['する verb', 'potential', 'polite']);
  });

  it('strips an honorific prefix when nothing matches without it', async () => {
    expect((await first('ご確認'))!.term).toBe('確認');
    expect((await first('お待ちください'))!.term).toBe('待つ');
    // お世話 is its own entry, so it wins over 世話.
    expect((await first('お世話'))!.term).toBe('お世話');
  });

  it('keeps homographs apart by part of speech', async () => {
    // きった can only be the past of 切る (godan); 着る (ichidan) makes きた.
    const cut = await look('きった');
    expect(cut.map((m) => m.entry.k[0])).toEqual(['切る']);
    const wore = await look('着た');
    expect(wore.map((m) => m.entry.k[0])).toEqual(['着る']);
    // かう is both 買う and 飼う: both offered, nothing silently chosen between them.
    const kau = await look('かう');
    expect(kau.map((m) => m.entry.k[0]).sort()).toEqual(['買う', '飼う']);
    // Spelled with kanji, only one fits.
    expect((await look('飼った')).map((m) => m.entry.k[0])).toEqual(['飼う']);
  });

  it('prefers an exact match to a deinflected one', async () => {
    const m = await look('ない');
    expect(m[0]!.entry.k[0]).toBe('無い');
    expect(m[0]!.reasons).toEqual([]);
  });

  it('reads a kanji form with its own reading, and a kana form as itself', () => {
    const iku = ENTRIES.find((e) => e.k[0] === '行く')!;
    expect(readingFor({ entry: iku, term: '行く', reasons: [], byKanji: true })).toBe('いく');
    expect(readingFor({ entry: iku, term: 'ゆく', reasons: [], byKanji: false })).toBe('ゆく');
  });

  it('matches katakana and hiragana spellings of the same word', async () => {
    expect((await first('マジ'))!.entry.r).toContain('まじ');
    expect((await first('まじ'))!.term).toBe('まじ');
    const uke = await first('ウケる');
    expect(uke!.entry.k[0]).toBe('受ける');
    expect(cardFields(uke!).reading).toBe('ウケる');
  });

  it('returns nothing for text the dictionary lacks, and for blank text', async () => {
    expect(await look('ほげほげ')).toEqual([]);
    expect(await look('  ')).toEqual([]);
    expect(lookupPlan('').terms).toEqual([]);
  });

  it('asks for hiragana versions of katakana terms', () => {
    const { terms } = lookupPlan('ヤバかった');
    expect(terms).toContain('ヤバい');
    expect(terms).toContain(toHiragana('ヤバい'));
  });
});

describe('slang, colloquial and register tags', () => {
  it.each([
    ['ヤバい', ['colloquial', 'slang'], 'casual'],
    ['マジ', ['colloquial'], 'casual'],
    ['めっちゃ', ['colloquial', 'dialect', '関西弁'], 'casual'],
    ['ガチ', ['slang'], 'casual'],
    ['キモい', ['slang'], 'casual'],
    ['ググる', ['slang', 'internet slang'], 'casual'],
    ['ウザい', ['colloquial'], 'casual'],
    ['稟議', ['ビジネス'], null],
    ['いらっしゃる', [], '尊敬語'],
    ['お世話', [], 'polite'],
    ['平素', [], 'written-only'],
  ])('%s', async (word, tags, register) => {
    const f = cardFields((await first(word))!);
    expect(f.tags.filter((t) => t !== AUTO_TAG).sort()).toEqual([...tags].sort());
    expect(f.register).toBe(register);
  });

  it('labels the slang sense of a word that is also standard', async () => {
    const kusa = (await first('草'))!;
    expect(tagsFor(kusa.entry.s)).toEqual(['slang', 'internet slang']);
    expect(labelsFor(kusa)).toContain('common');
  });

  it('never calls a word archaic because of a later sense', () => {
    expect(tagsFor([{ g: ['x'] }, { g: ['y'], m: ['arch'] }])).toEqual([]);
    expect(tagsFor([{ g: ['x'], m: ['arch'] }])).toEqual(['archaic']);
  });

  it('matches entries passed in any order, once each', () => {
    const twice = [...ENTRIES, ...ENTRIES].reverse();
    const m = matchEntries('かう', twice);
    expect(m).toHaveLength(2);
  });
});
