/**
 * Looking a word up in the offline dictionary and turning an entry into
 * card fields. Pure: the caller supplies the entries (from IndexedDB in the
 * app, from the fixture in tests).
 */
import { toHiragana } from '../furigana';
import { AUTO_TAG, type Register } from '../types';
import { classesOf, deinflect, DICT_CLASSES, W, type Candidate } from './deinflect';
import type { DictEntry, DictSense } from './entry';

export interface DictMatch {
  entry: DictEntry;
  /** Dictionary form, in the script of the text that was looked up. */
  term: string;
  /** How the text was reduced to the term, nearest the dictionary form first. Empty for an exact match. */
  reasons: string[];
  /** True when the term is one of the entry's kanji forms, false when it is a reading. */
  byKanji: boolean;
}

const PREFIX = /^[おご御]/;
const KANA_ONLY = /^[぀-ヿー]+$/;

/** Candidate dictionary forms for the text, and the strings to fetch entries for. */
export function lookupPlan(text: string): { candidates: Candidate[]; terms: string[] } {
  const t = text.trim();
  if (!t) return { candidates: [], terms: [] };
  const candidates = deinflect(t);
  // お待ちください → 待つ, ご確認 → 確認. Ranked after anything found without stripping.
  if (PREFIX.test(t) && [...t].length > 1) {
    for (const c of deinflect(t.slice(1))) candidates.push({ ...c, reasons: [...c.reasons, 'honorific prefix'] });
  }
  const useful = candidates.filter((c) => c.reasons.length === 0 || (c.cls & (DICT_CLASSES | W.ANY)) !== 0);
  const terms = new Set<string>();
  for (const c of useful) {
    terms.add(c.term);
    terms.add(toHiragana(c.term));
  }
  return { candidates: useful, terms: [...terms] };
}

/** Every part of speech in the entry. */
function posOf(entry: DictEntry): string[] {
  return entry.s.flatMap((s) => s.p ?? []);
}

function hasKanji(entry: DictEntry): boolean {
  return entry.k.length > 0;
}

/** The senses that apply to the form that matched. */
export function sensesFor(entry: DictEntry, term: string, byKanji: boolean): DictSense[] {
  const reading = byKanji ? null : entry.r.find((r) => toHiragana(r) === toHiragana(term)) ?? term;
  const out = entry.s.filter((s) => (byKanji ? !s.ak || s.ak.includes(term) : !s.ar || s.ar.includes(reading!)));
  return out.length > 0 ? out : entry.s;
}

/** Rank: exact before deinflected, common before rare, kana words found by kana before kanji words, short chains first. */
function score(m: DictMatch, query: string): number[] {
  const kanaQuery = KANA_ONLY.test(query);
  const usuallyKana = !hasKanji(m.entry) || sensesFor(m.entry, m.term, m.byKanji).some((s) => s.m?.includes('uk'));
  return [
    m.reasons.length === 0 ? 0 : 1,
    m.entry.c ? 0 : 1,
    kanaQuery && !m.byKanji && !usuallyKana ? 1 : 0,
    m.reasons.length,
    m.byKanji ? 0 : 1,
    m.entry.i,
  ];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/** Match fetched entries against the candidates for `text`, best first, one match per entry. */
export function matchEntries(text: string, entries: Iterable<DictEntry>): DictMatch[] {
  const { candidates } = lookupPlan(text);
  const found: DictMatch[] = [];
  const seen = new Set<number>();
  for (const entry of entries) {
    if (seen.has(entry.i)) continue;
    const readings = new Set(entry.r.map(toHiragana));
    const classes = classesOf(posOf(entry));
    for (const c of candidates) {
      const byKanji = entry.k.includes(c.term);
      if (!byKanji && !readings.has(toHiragana(c.term))) continue;
      // A deinflected form only counts if the entry can actually inflect that way.
      if ((c.cls & W.ANY) === 0 && (classes & c.cls) === 0) continue;
      found.push({ entry, term: c.term, reasons: c.reasons, byKanji });
      seen.add(entry.i);
      break;
    }
  }
  const t = text.trim();
  return found.sort((a, b) => compare(score(a, t), score(b, t)));
}

/** Look a word up through `fetch`, which returns the entries having any of the given kanji forms or readings. */
export async function lookupWord(text: string, fetch: (terms: string[]) => Promise<DictEntry[]>): Promise<DictMatch[]> {
  const { terms } = lookupPlan(text);
  if (terms.length === 0) return [];
  return matchEntries(text, await fetch(terms));
}

// ---- Tags and register ---------------------------------------------------------

const MISC_TAGS: Record<string, string[]> = {
  sl: ['slang'],
  'net-sl': ['slang', 'internet slang'],
  'm-sl': ['slang'],
  col: ['colloquial'],
  fam: ['colloquial'],
  vulg: ['vulgar'],
  derog: ['derogatory'],
  arch: ['archaic'],
  obs: ['archaic'],
};
const FIELD_TAGS: Record<string, string> = { bus: 'ビジネス', comp: 'IT', law: '法律', finc: '経済', econ: '経済' };
const DIALECTS: Record<string, string> = { ksb: '関西弁', osb: '関西弁', kyb: '関西弁' };
const REGISTER_OF: Record<string, Register> = {
  hon: '尊敬語',
  hum: '謙譲語',
  pol: 'polite',
  col: 'casual',
  fam: 'casual',
  sl: 'casual',
  'net-sl': 'casual',
  'm-sl': 'casual',
  vulg: 'casual',
  form: 'written-only',
};

/** Tags for the app from JMdict's labels on these senses. */
export function tagsFor(senses: DictSense[]): string[] {
  const out = new Set<string>();
  for (const [i, s] of senses.entries()) {
    for (const m of s.m ?? []) {
      // An old sense further down doesn't make the word archaic.
      if ((m === 'arch' || m === 'obs') && i > 0) continue;
      for (const t of MISC_TAGS[m] ?? []) out.add(t);
    }
    for (const f of s.f ?? []) if (FIELD_TAGS[f]) out.add(FIELD_TAGS[f]);
    for (const d of s.d ?? []) {
      out.add('dialect');
      if (DIALECTS[d]) out.add(DIALECTS[d]);
    }
  }
  return [...out];
}

/** Register from the first sense that carries one. */
export function registerFor(senses: DictSense[]): Register | null {
  for (const s of senses) for (const m of s.m ?? []) if (REGISTER_OF[m]) return REGISTER_OF[m];
  return null;
}

/** The reading to store for a match. */
export function readingFor(m: DictMatch): string {
  if (!m.byKanji) return m.term;
  const fits = (r: string) => !m.entry.rk?.[r] || m.entry.rk[r]!.includes(m.term);
  return m.entry.r.find((r) => fits(r) && !m.entry.rx?.includes(r)) ?? m.entry.r.find(fits) ?? m.entry.r[0] ?? '';
}

const MAX_SENSES = 3;
const MAX_GLOSSES = 4;

/** English meaning: up to three senses, numbered when there is more than one. */
export function meaningFor(senses: DictSense[]): string {
  const used = senses.slice(0, MAX_SENSES).map((s) => s.g.slice(0, MAX_GLOSSES).join('; '));
  return used.length === 1 ? used[0]! : used.map((g, i) => `${i + 1}. ${g}`).join(' ');
}

export interface DictFields {
  word: string;
  reading: string;
  meaning_en: string;
  example_ja: string;
  example_en: string;
  /** Includes AUTO_TAG. */
  tags: string[];
  register: Register | null;
}

/** Card fields for a match. The example is the dictionary's, used only where the card has none of its own. */
export function cardFields(m: DictMatch): DictFields {
  const senses = sensesFor(m.entry, m.term, m.byKanji);
  const used = senses.slice(0, MAX_SENSES);
  const ex = used.find((s) => s.x && s.x.length > 0)?.x?.[0];
  return {
    word: m.term,
    reading: readingFor(m),
    meaning_en: meaningFor(senses),
    example_ja: ex?.[0] ?? '',
    example_en: ex?.[1] ?? '',
    tags: [...tagsFor(used), AUTO_TAG],
    register: registerFor(used),
  };
}

/** Short labels for display next to a candidate: part of speech and register. */
export function labelsFor(m: DictMatch): string[] {
  const used = sensesFor(m.entry, m.term, m.byKanji).slice(0, MAX_SENSES);
  const labels = tagsFor(used);
  const reg = registerFor(used);
  if (reg && reg !== 'casual') labels.unshift(reg);
  if (m.entry.c) labels.unshift('common');
  return labels;
}
