import { REGISTERS, type Card, type Register } from '../types';

export type Delimiter = '\t' | ',';

/** Guess tab vs comma from the first few lines. Tab wins if it appears at all. */
export function detectDelimiter(text: string): Delimiter {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  return head.includes('\t') ? '\t' : ',';
}

/** RFC-4180-style parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStart = true;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      fieldStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStart = true;
    } else {
      field += ch;
      fieldStart = false;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

export const IMPORT_FIELDS = [
  'word',
  'reading',
  'meaning_en',
  'meaning_ja',
  'example_ja',
  'example_en',
  'tags',
  'register',
  'source',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = (ImportField | null)[];

const HEADER_ALIASES: Record<ImportField, string[]> = {
  word: ['word', 'expression', 'vocab', 'term', 'front', '単語', '語', '語彙', '表現', '見出し'],
  reading: ['reading', 'kana', 'furigana', 'yomi', '読み', 'よみ', '読み方', 'かな', 'ふりがな'],
  meaning_en: ['meaning', 'meaning_en', 'english', 'definition', 'gloss', 'back', '意味', '英語', '英訳'],
  meaning_ja: ['meaning_ja', 'japanese definition', '定義', '日本語の意味', '語義'],
  example_ja: ['example', 'example_ja', 'sentence', '例文', '例'],
  example_en: ['example_en', 'translation', 'sentence translation', '例文訳', '訳'],
  tags: ['tags', 'tag', 'タグ'],
  register: ['register', '敬語', 'レジスター', '文体'],
  source: ['source', '出典', 'ソース', 'メモ'],
};

const KANA_ONLY = /^[぀-ヿー・\s]+$/;
const HAS_KANJI = /[一-鿿々]/;
const HAS_JAPANESE = /[぀-ヿ一-鿿]/;

/** True if the first row looks like column names rather than data. */
export function looksLikeHeader(rows: string[][]): boolean {
  const first = rows[0];
  if (!first) return false;
  const known = Object.values(HEADER_ALIASES).flat();
  return first.some((cell) => known.includes(cell.toLowerCase()));
}

/** Suggest a mapping: from header names if present, otherwise from what the data looks like. */
export function guessMapping(rows: string[][], hasHeader: boolean): ColumnMapping {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const mapping: ColumnMapping = new Array(width).fill(null);
  const used = new Set<ImportField>();
  const assign = (col: number, field: ImportField) => {
    if (mapping[col] == null && !used.has(field)) {
      mapping[col] = field;
      used.add(field);
    }
  };
  if (hasHeader && rows[0]) {
    rows[0].forEach((cell, col) => {
      const name = cell.toLowerCase();
      for (const field of IMPORT_FIELDS) if (HEADER_ALIASES[field].includes(name)) assign(col, field);
    });
    if (used.size > 0) return mapping;
  }
  const sample = rows.slice(hasHeader ? 1 : 0, 20);
  const share = (col: number, test: (s: string) => boolean) => {
    const cells = sample.map((r) => r[col] ?? '').filter((c) => c !== '');
    return cells.length === 0 ? 0 : cells.filter(test).length / cells.length;
  };
  const avgLen = (col: number) => {
    const cells = sample.map((r) => r[col] ?? '').filter((c) => c !== '');
    return cells.length === 0 ? 0 : cells.reduce((n, c) => n + c.length, 0) / cells.length;
  };
  for (let col = 0; col < width; col++) {
    if (share(col, (s) => HAS_KANJI.test(s)) > 0.5 && avgLen(col) <= 12) assign(col, 'word');
    else if (share(col, (s) => KANA_ONLY.test(s)) > 0.7) assign(col, 'reading');
    else if (share(col, (s) => HAS_JAPANESE.test(s)) > 0.7 && avgLen(col) > 12) assign(col, 'example_ja');
    else if (share(col, (s) => !HAS_JAPANESE.test(s)) > 0.7) assign(col, used.has('meaning_en') ? 'example_en' : 'meaning_en');
  }
  if (!used.has('word') && width > 0 && mapping[0] == null) assign(0, 'word');
  return mapping;
}

export type CardDraft = Pick<
  Card,
  'word' | 'reading' | 'meaning_en' | 'meaning_ja' | 'example_ja' | 'example_en' | 'tags' | 'register' | 'source'
>;

export function parseRegister(s: string): Register | null {
  const v = s.trim().toLowerCase();
  const hit = REGISTERS.find((r) => r.toLowerCase() === v);
  if (hit) return hit;
  if (['sonkeigo', 'honorific'].includes(v)) return '尊敬語';
  if (['kenjougo', 'kenjogo', 'humble'].includes(v)) return '謙譲語';
  if (['written', '書き言葉', '文語'].includes(v)) return 'written-only';
  if (['丁寧語', 'teineigo'].includes(v)) return 'polite';
  return null;
}

export function splitTags(s: string): string[] {
  return [...new Set(s.split(/[,、;；\s]+/).map((t) => t.trim()).filter(Boolean))];
}

export interface BulkResult {
  drafts: CardDraft[];
  /** Rows with no word in the mapped column. */
  skippedEmpty: number;
  /** Rows whose word + reading already exist (in the deck or earlier in the paste). */
  skippedDuplicate: number;
}

export function rowsToDrafts(
  rows: string[][],
  mapping: ColumnMapping,
  hasHeader: boolean,
  existing: Iterable<Pick<Card, 'word' | 'reading'>>,
  extraTags: string[] = [],
): BulkResult {
  const seen = new Set<string>();
  for (const c of existing) seen.add(`${c.word}\u0000${c.reading}`);
  const result: BulkResult = { drafts: [], skippedEmpty: 0, skippedDuplicate: 0 };
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const get = (field: ImportField) => {
      const col = mapping.indexOf(field);
      return col === -1 ? '' : (row[col] ?? '').trim();
    };
    const word = get('word');
    if (!word) {
      result.skippedEmpty++;
      continue;
    }
    const reading = get('reading');
    const key = `${word}\u0000${reading}`;
    if (seen.has(key)) {
      result.skippedDuplicate++;
      continue;
    }
    seen.add(key);
    result.drafts.push({
      word,
      reading,
      meaning_en: get('meaning_en'),
      meaning_ja: get('meaning_ja'),
      example_ja: get('example_ja'),
      example_en: get('example_en'),
      tags: [...new Set([...splitTags(get('tags')), ...extraTags])],
      register: parseRegister(get('register')),
      source: get('source'),
    });
  }
  return result;
}
