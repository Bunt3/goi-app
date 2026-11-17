/**
 * Keigo training: drill items built from src/data/keigo.ts, and a simple
 * box schedule (separate from the card scheduler on purpose: this is a skill
 * drill, not vocabulary). Pure.
 */
import { DAY_MS, startOfDay } from './day';
import { FORMS, PHRASES, USAGE, VERBS, WORDS, type KeigoKind } from './data/keigo';

export type KeigoItem =
  | { id: string; kind: 'convert'; prompt: string; reading: string; en: string; target: string; answer: string; note: string }
  | { id: string; kind: 'classify'; prompt: string; answer: KeigoKind; plain: string; note: string }
  | { id: string; kind: 'judge'; prompt: string; answer: boolean; note: string };

export interface KeigoProgress {
  /** 0 = just missed or new; each correct answer moves up one box. */
  box: number;
  /** Epoch ms; not offered before this. */
  due: number;
}

/** Days until an item comes back, by box. */
export const BOX_DAYS = [0, 1, 3, 7, 21, 60];
export const MASTERED_BOX = 4;

export function allItems(): KeigoItem[] {
  const convert: KeigoItem[] = [];
  for (const [id, plain, reading, en, sonkei, kenjou, note] of VERBS) {
    if (sonkei) convert.push({ id: `v:${id}:son`, kind: 'convert', prompt: plain, reading, en, target: '尊敬語', answer: sonkei, note });
    if (kenjou) convert.push({ id: `v:${id}:ken`, kind: 'convert', prompt: plain, reading, en, target: '謙譲語', answer: kenjou, note });
  }
  for (const [casual, formal, reading, note] of WORDS) {
    convert.push({ id: `w:${casual}`, kind: 'convert', prompt: casual, reading: '', en: '', target: '改まった言い方', answer: `${formal}（${reading}）`, note });
  }
  for (const [casual, formal, note] of PHRASES) {
    convert.push({ id: `p:${casual}`, kind: 'convert', prompt: casual, reading: '', en: '', target: '職場の敬語', answer: formal, note });
  }
  const classify: KeigoItem[] = FORMS.map(([form, kind, plain, note]) => ({ id: `f:${form}`, kind: 'classify', prompt: form, answer: kind, plain, note }));
  const judge: KeigoItem[] = USAGE.map(([text, ok, note]) => ({ id: `u:${text}`, kind: 'judge', prompt: text, answer: ok, note }));
  // Mix the three kinds so a session isn't all one exercise.
  const out: KeigoItem[] = [];
  const lists = [convert, classify, judge];
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const [n, list] of lists.entries()) {
      // Conversions are the core skill: two of them for each of the others.
      const step = n === 0 ? 2 : 1;
      for (let k = 0; k < step; k++) {
        const item = list[i * step + k];
        if (item) out.push(item);
      }
    }
  }
  return out;
}

/** Up to n items: missed and due ones first (lowest box, then oldest), then new ones in order. */
export function pickSession(items: KeigoItem[], progress: Record<string, KeigoProgress>, now: number, n = 10): KeigoItem[] {
  const due = items
    .filter((i) => progress[i.id] && progress[i.id]!.due <= now)
    .sort((a, b) => progress[a.id]!.box - progress[b.id]!.box || progress[a.id]!.due - progress[b.id]!.due);
  const fresh = items.filter((i) => !progress[i.id]);
  return [...due, ...fresh].slice(0, n);
}

/** Next state after an answer. Correct: up a box, back after that box's days. Missed: box 0, back next session. */
export function grade(prev: KeigoProgress | undefined, correct: boolean, now: number): KeigoProgress {
  if (!correct) return { box: 0, due: now };
  const box = Math.min((prev?.box ?? 0) + 1, BOX_DAYS.length - 1);
  return { box, due: startOfDay(now) + BOX_DAYS[box]! * DAY_MS };
}

export function keigoStats(items: KeigoItem[], progress: Record<string, KeigoProgress>, now: number): { total: number; seen: number; mastered: number; due: number } {
  let seen = 0;
  let mastered = 0;
  let due = 0;
  for (const i of items) {
    const p = progress[i.id];
    if (!p) continue;
    seen++;
    if (p.box >= MASTERED_BOX) mastered++;
    if (p.due <= now) due++;
  }
  return { total: items.length, seen, mastered, due };
}

/** Drop progress for items that no longer exist and malformed entries (used when reading settings). */
export function cleanProgress(v: unknown): Record<string, KeigoProgress> {
  const out: Record<string, KeigoProgress> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
    const o = p as Record<string, unknown> | null;
    if (o && typeof o.box === 'number' && typeof o.due === 'number') out[k] = { box: Math.max(0, Math.min(BOX_DAYS.length - 1, Math.round(o.box))), due: o.due };
  }
  return out;
}
