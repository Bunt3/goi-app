import { describe, expect, it } from 'vitest';
import { FORMS, USAGE, VERBS } from '../src/data/keigo';
import { DAY } from './helpers';
import { T0 } from './helpers';
import { allItems, cleanProgress, grade, keigoStats, pickSession } from '../src/keigo';

describe('keigo training items', () => {
  const items = allItems();

  it('has unique ids and every kind of exercise', () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(['convert', 'classify', 'judge']));
    expect(items.length).toBeGreaterThan(100);
  });

  it('turns each verb into one drill per form it has', () => {
    const son = VERBS.filter((v) => v[4]).length;
    const ken = VERBS.filter((v) => v[5]).length;
    expect(items.filter((i) => i.id.startsWith('v:')).length).toBe(son + ken);
    expect(items.find((i) => i.id === 'v:iu:son')).toMatchObject({ prompt: '言う', target: '尊敬語', answer: 'おっしゃる' });
  });

  it('marks the classic double-keigo mistakes as wrong', () => {
    const wrong = USAGE.filter(([, ok]) => !ok).map(([t]) => t);
    expect(wrong).toContain('部長がおっしゃられたとおりです');
    expect(FORMS.find(([f]) => f === '参る')?.[1]).toBe('謙譲語');
  });

  it('mixes the kinds early in the order', () => {
    expect(new Set(items.slice(0, 4).map((i) => i.kind)).size).toBe(3);
  });
});

describe('keigo schedule', () => {
  const items = allItems();

  it('starts with new items, then brings back missed and due ones first', () => {
    const first = pickSession(items, {}, T0, 10);
    expect(first).toHaveLength(10);
    const progress = {
      [first[0]!.id]: grade(undefined, true, T0),
      [first[1]!.id]: grade(undefined, false, T0),
    };
    const next = pickSession(items, progress, T0 + 1000, 10);
    expect(next[0]!.id).toBe(first[1]!.id); // missed: right back
    expect(next.map((i) => i.id)).not.toContain(first[0]!.id); // correct: tomorrow
    const tomorrow = pickSession(items, progress, T0 + DAY, 10);
    expect(tomorrow.slice(0, 2).map((i) => i.id).sort()).toEqual([first[0]!.id, first[1]!.id].sort());
  });

  it('moves up a box per correct answer and drops to 0 on a miss', () => {
    let p = grade(undefined, true, T0);
    expect(p.box).toBe(1);
    for (let i = 0; i < 10; i++) p = grade(p, true, T0);
    expect(p.box).toBe(5);
    expect(grade(p, false, T0)).toEqual({ box: 0, due: T0 });
  });

  it('counts seen, mastered and due', () => {
    const [a, b] = items;
    const s = keigoStats(items, { [a!.id]: { box: 4, due: T0 + 5 * DAY }, [b!.id]: { box: 0, due: T0 } }, T0);
    expect(s).toEqual({ total: items.length, seen: 2, mastered: 1, due: 1 });
  });

  it('cleans malformed progress read from a file', () => {
    expect(cleanProgress({ a: { box: 9, due: 1 }, b: { box: 'x' }, c: null })).toEqual({ a: { box: 5, due: 1 } });
    expect(cleanProgress('nope')).toEqual({});
  });
});
