import { describe, expect, it } from 'vitest';
import { detectDelimiter, guessMapping, looksLikeHeader, parseDelimited, parseRegister, rowsToDrafts } from '../src/data/tsv';

describe('pasted TSV/CSV', () => {
  it('detects the delimiter', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t');
    expect(detectDelimiter('a,b\nc,d')).toBe(',');
  });

  it('parses quoted fields, embedded delimiters, doubled quotes and CRLF', () => {
    const rows = parseDelimited('word,meaning\r\n"稟議","approval, by ""ringi"""\r\n\r\n齟齬,"line1\nline2"\r\n');
    expect(rows).toEqual([
      ['word', 'meaning'],
      ['稟議', 'approval, by "ringi"'],
      ['齟齬', 'line1\nline2'],
    ]);
  });

  it('maps columns from a header row, in Japanese or English', () => {
    const rows = parseDelimited('単語\t読み\t意味\t例文\tタグ\n査収\tさしゅう\tcheck and accept\tご査収ください。\tメール');
    expect(looksLikeHeader(rows)).toBe(true);
    expect(guessMapping(rows, true)).toEqual(['word', 'reading', 'meaning_en', 'example_ja', 'tags']);
  });

  it('guesses columns from content when there is no header', () => {
    const rows = parseDelimited(
      '査収\tさしゅう\tcheck and accept\tご査収のほどよろしくお願いいたします。\n失念\tしつねん\tto forget (formal)\t返信を失念しておりました。',
    );
    expect(looksLikeHeader(rows)).toBe(false);
    expect(guessMapping(rows, false)).toEqual(['word', 'reading', 'meaning_en', 'example_ja']);
  });

  it('builds drafts, skipping blanks and duplicates', () => {
    const rows = parseDelimited('word,reading,meaning,tags,register\n査収,さしゅう,check,メール 会議,written\n,x,y,,\n査収,さしゅう,dup,,\n失念,しつねん,,,謙譲語\n既存,きそん,existing,,');
    const result = rowsToDrafts(rows, guessMapping(rows, true), true, [{ word: '既存', reading: 'きそん' }], ['imported']);
    expect(result.skippedEmpty).toBe(1);
    expect(result.skippedDuplicate).toBe(2);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0]).toMatchObject({ word: '査収', tags: ['メール', '会議', 'imported'], register: 'written-only' });
    expect(result.drafts[1]).toMatchObject({ word: '失念', meaning_en: '', register: '謙譲語' });
  });

  it('normalises register names', () => {
    expect(parseRegister('Polite')).toBe('polite');
    expect(parseRegister('humble')).toBe('謙譲語');
    expect(parseRegister('???')).toBeNull();
  });
});
