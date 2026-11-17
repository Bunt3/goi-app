import { describe, expect, it } from 'vitest';
import { DAY_MS, startOfDay } from '../src/day';
import { applyReview, retrievability } from '../src/srs/fsrs';
import { backlogDays, buildQueue, forecast, pickNext } from '../src/srs/queue';
import type { Card, ReviewLog } from '../src/types';
import { DAY, SETTINGS, T0, makeCard, review, reviewCard } from './helpers';

const ids = (items: { cardId: string }[]) => items.map((i) => i.cardId);

describe('daily caps', () => {
  it('limits new cards to maxNewPerDay, oldest first', () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard({ created: T0 - (20 - i) * 1000 }));
    const q = buildQueue(cards, [], SETTINGS, T0);
    expect(q.counts.new).toBe(8);
    expect(q.counts.newWaiting).toBe(12);
    expect(ids(q.main)).toEqual(ids(cards.slice(0, 8).map((c) => ({ cardId: c.id }))));
  });

  it('limits reviews to maxReviewsPerDay and reports the rest as deferred', () => {
    const cards = Array.from({ length: 100 }, () => reviewCard(T0, 10, 10));
    const q = buildQueue(cards, [], SETTINGS, T0);
    expect(q.counts.review).toBe(40);
    expect(q.counts.deferred).toBe(60);
    expect(q.main).toHaveLength(40);
  });

  it('honours adjusted caps', () => {
    const cards = [
      ...Array.from({ length: 30 }, () => reviewCard(T0, 10, 10)),
      ...Array.from({ length: 30 }, () => makeCard()),
    ];
    const q = buildQueue(cards, [], { ...SETTINGS, maxReviewsPerDay: 50, maxNewPerDay: 3 }, T0);
    expect(q.counts.review).toBe(30);
    expect(q.counts.new).toBe(3);
  });

  it('counts work already done today against both caps', () => {
    const logs: ReviewLog[] = [];
    let cards: Card[] = [
      ...Array.from({ length: 50 }, () => reviewCard(T0, 10, 10)),
      ...Array.from({ length: 20 }, () => makeCard()),
    ];
    // Do 15 reviews and 5 new cards earlier today.
    const first = buildQueue(cards, logs, { ...SETTINGS, pauseNewDuringBacklog: false }, T0);
    const todo = [...first.main.filter((i) => i.kind === 'review').slice(0, 15), ...first.main.filter((i) => i.kind === 'new').slice(0, 5)];
    for (const item of todo) {
      cards = cards.map((c) => (c.id === item.cardId ? review(c, item.direction, 4, T0 + 1000, logs) : c));
    }
    const q = buildQueue(cards, logs, SETTINGS, T0 + 60_000);
    expect(q.counts.reviewsDoneToday).toBe(15);
    expect(q.counts.newDoneToday).toBe(5);
    expect(q.counts.review).toBe(25); // 40 - 15
    // 10 reviews still don't fit, so new cards pause; with the pause off, 3 remain (8 - 5).
    expect(q.counts.deferred).toBe(10);
    expect(q.counts.new).toBe(0);
    const q2 = buildQueue(cards, logs, { ...SETTINGS, pauseNewDuringBacklog: false }, T0 + 60_000);
    expect(q2.counts.new).toBe(3);
  });

  it('resets the counters at the 04:00 day rollover', () => {
    const logs: ReviewLog[] = [];
    let cards: Card[] = Array.from({ length: 20 }, () => makeCard());
    const first = buildQueue(cards, logs, SETTINGS, T0);
    for (const item of first.main) {
      cards = cards.map((c) => (c.id === item.cardId ? review(c, item.direction, 4, T0, logs) : c));
    }
    expect(buildQueue(cards, logs, SETTINGS, T0 + 3600_000).counts.new).toBe(0);
    const tomorrow = startOfDay(T0) + DAY_MS + 3600_000;
    const todayLogs = logs.filter((l) => l.reviewedAt >= startOfDay(tomorrow));
    expect(buildQueue(cards, todayLogs, SETTINGS, tomorrow).counts.new).toBe(8);
  });

  it('never queues inbox or deleted cards', () => {
    const cards = [makeCard({ meaning_en: '' }), makeCard({ reading: '' }), makeCard({ deleted: true }), makeCard()];
    const q = buildQueue(cards, [], SETTINGS, T0);
    expect(ids(q.main)).toEqual([cards[3]!.id]);
  });
});

describe('overdue spreading', () => {
  /** 100 cards overdue by 1..100 days on a 10-day interval, plus nothing else. */
  const backlog = () => Array.from({ length: 100 }, (_, i) => reviewCard(T0, 11 + i, 10));

  it('shows the lowest-retrievability cards first', () => {
    const cards = backlog();
    const q = buildQueue(cards, [], SETTINGS, T0);
    const rs = q.main.map((i) => i.retrievability);
    expect(rs).toEqual([...rs].sort((a, b) => a - b));
    // The 40 chosen are exactly the 40 most-forgotten cards.
    const allR = cards.map((c) => retrievability(c.srs.recognition, T0, 0.9)).sort((a, b) => a - b);
    expect(Math.max(...rs)).toBeCloseTo(allR[39]!, 10);
    expect(q.counts.deferred).toBe(60);
  });

  it('does not dump the backlog: it drains at the cap over the following days', () => {
    // New cards off: reviewing a card unlocks its production side, which is a separate concern.
    const settings = { ...SETTINGS, maxNewPerDay: 0 };
    let cards = backlog();
    const perDay: number[] = [];
    const seen = new Set<string>();
    for (let day = 0; day < 5; day++) {
      const now = T0 + day * DAY;
      const logs: ReviewLog[] = [];
      const q = buildQueue(cards, logs, settings, now);
      perDay.push(q.counts.review);
      expect(q.counts.review).toBeLessThanOrEqual(40);
      for (const item of q.main) {
        expect(seen.has(item.cardId)).toBe(false); // nothing shown twice
        seen.add(item.cardId);
        // Easy on a long-overdue card pushes it well beyond this 5-day window.
        cards = cards.map((c) => (c.id === item.cardId ? review(c, item.direction, 4, now, logs) : c));
      }
      // After finishing the day's quota, nothing more is offered that day.
      expect(buildQueue(cards, logs, settings, now + 1000).main).toHaveLength(0);
    }
    expect(perDay).toEqual([40, 40, 20, 0, 0]);
    expect(seen.size).toBe(100);
  });

  it('mixes newly due cards into the backlog by retrievability, not by due date', () => {
    const veryOverdue = reviewCard(T0, 60, 10);
    const dueToday = reviewCard(T0, 10, 10);
    const slightlyOverdue = reviewCard(T0, 12, 10);
    const q = buildQueue([dueToday, slightlyOverdue, veryOverdue], [], SETTINGS, T0);
    expect(ids(q.main)).toEqual([veryOverdue.id, slightlyOverdue.id, dueToday.id]);
  });

  it('pauses new cards while reviews overflow the cap, and resumes after', () => {
    const cards = [...backlog(), ...Array.from({ length: 10 }, () => makeCard())];
    const q = buildQueue(cards, [], SETTINGS, T0);
    expect(q.counts.newPaused).toBe(true);
    expect(q.counts.new).toBe(0);
    const small = [...backlog().slice(0, 30), ...Array.from({ length: 10 }, () => makeCard())];
    const q2 = buildQueue(small, [], SETTINGS, T0);
    expect(q2.counts.newPaused).toBe(false);
    expect(q2.counts.new).toBe(8);
  });

  it('does not count future cards as due', () => {
    const q = buildQueue([reviewCard(T0, 1, 10), reviewCard(T0, 9, 10)], [], SETTINGS, T0);
    expect(q.main).toHaveLength(0);
  });

  it('treats a card due later today as due today', () => {
    const c = reviewCard(T0, 10, 10);
    c.srs.recognition.due = T0 + 6 * 3600_000; // 16:00 today
    expect(buildQueue([c], [], SETTINGS, T0).main).toHaveLength(1);
  });

  it('forecast applies the cap day by day', () => {
    const cards = [
      ...backlog(), // 100 overdue
      ...Array.from({ length: 10 }, () => reviewCard(T0, 8, 10)), // due in 2 days
    ];
    const f = forecast(cards, [], SETTINGS, T0, 7);
    expect(f.map((d) => d.shown)).toEqual([40, 40, 30, 0, 0, 0, 0]);
    expect(f.map((d) => d.carried)).toEqual([60, 20, 0, 0, 0, 0, 0]);
    expect(f[2]!.due).toBe(10);
    expect(backlogDays(cards, [], SETTINGS, T0)).toBe(2);
    expect(backlogDays(cards.slice(0, 30), [], SETTINGS, T0)).toBe(0);
  });
});

describe('directions', () => {
  it('keeps production locked until recognition has succeeded, then offers it the next day', () => {
    const logs: ReviewLog[] = [];
    let card = makeCard();
    expect(buildQueue([card], logs, SETTINGS, T0).main.map((i) => i.direction)).toEqual(['recognition']);

    card = review(card, 'recognition', 1, T0, logs); // Again: still learning
    expect(card.productionUnlockedAt).toBeNull();
    card = review(card, 'recognition', 3, T0 + 60_000, logs); // Good: next learning step
    expect(card.productionUnlockedAt).toBeNull();
    card = review(card, 'recognition', 3, T0 + 11 * 60_000, logs); // Good: graduates
    expect(card.srs.recognition.state).toBe(2);
    expect(card.productionUnlockedAt).toBe(T0 + 11 * 60_000);

    // Same day: not yet.
    expect(buildQueue([card], logs, SETTINGS, T0 + 3600_000).main).toHaveLength(0);
    // From the next day on, production is offered as a new card — on the first
    // day its recognition side isn't also due (siblings never share a day).
    let offeredOn = -1;
    for (let day = 1; day <= 5 && offeredOn < 0; day++) {
      const now = T0 + day * DAY;
      const dayLogs: ReviewLog[] = [];
      const q = buildQueue([card], dayLogs, SETTINGS, now);
      expect(q.main.length).toBeLessThanOrEqual(1);
      const item = q.main[0];
      if (item?.direction === 'production') {
        expect(item.kind).toBe('new');
        offeredOn = day;
      } else if (item) card = review(card, 'recognition', 3, now, dayLogs);
    }
    expect(offeredOn).toBeGreaterThanOrEqual(1);
  });

  it('unlocks production immediately-next-day on an Easy first answer', () => {
    const card = review(makeCard(), 'recognition', 4, T0);
    expect(card.productionUnlockedAt).toBe(T0);
  });

  it('puts unlocked production cards ahead of brand-new words under the new cap', () => {
    const unlocked = Array.from({ length: 5 }, () => review(makeCard(), 'recognition', 4, T0 - DAY));
    const fresh = Array.from({ length: 10 }, () => makeCard());
    const q = buildQueue([...fresh, ...unlocked], [], SETTINGS, T0);
    const news = q.main.filter((i) => i.kind === 'new');
    expect(news).toHaveLength(8);
    expect(news.slice(0, 5).every((i) => i.direction === 'production')).toBe(true);
    expect(news.slice(5).every((i) => i.direction === 'recognition')).toBe(true);
  });

  it('buries the other direction of a card for the day', () => {
    const c = reviewCard(T0, 10, 10);
    const both: Card = {
      ...c,
      productionUnlockedAt: T0 - 50 * DAY,
      srs: { ...c.srs, production: { ...c.srs.recognition, stability: 20 } },
    };
    const q = buildQueue([both], [], SETTINGS, T0);
    expect(q.main).toHaveLength(1);
    expect(q.main[0]!.direction).toBe('recognition'); // lower stability → lower retrievability
    expect(q.counts.buried).toBe(1);
    // After reviewing it, the sibling stays buried today...
    const logs: ReviewLog[] = [];
    const after = review(both, 'recognition', 3, T0, logs);
    expect(buildQueue([after], logs, SETTINGS, T0 + 1000).main).toHaveLength(0);
    // ...and is offered tomorrow.
    expect(buildQueue([after], [], SETTINGS, T0 + DAY).main.map((i) => i.direction)).toEqual(['production']);
  });
});

describe('session flow', () => {
  it('brings a failed card back within the session', () => {
    const logs: ReviewLog[] = [];
    let card = makeCard();
    const other = makeCard();
    card = review(card, 'recognition', 1, T0, logs); // Again → due in 1 minute
    let q = buildQueue([card, other], logs, SETTINGS, T0 + 1000);
    expect(q.counts.learning).toBe(1);
    // Not due yet: the next new card is shown first.
    expect(pickNext(q, T0 + 1000).item?.cardId).toBe(other.id);
    // Due: learning card takes priority.
    q = buildQueue([card, other], logs, SETTINGS, T0 + 61_000);
    expect(pickNext(q, T0 + 61_000).item?.cardId).toBe(card.id);
  });

  it('shows a learning card early when nothing else is left, and reports the wait otherwise', () => {
    const logs: ReviewLog[] = [];
    const card = review(makeCard(), 'recognition', 3, T0, logs); // Good → 10 min step
    const q = buildQueue([card], logs, SETTINGS, T0 + 1000);
    expect(pickNext(q, T0 + 1000).item?.cardId).toBe(card.id);
    const far: Card = { ...card, srs: { ...card.srs, recognition: { ...card.srs.recognition, due: T0 + 3 * 3600_000 } } };
    const pick = pickNext(buildQueue([far], logs, SETTINGS, T0 + 1000), T0 + 1000);
    expect(pick.item).toBeNull();
    expect(pick.waitMs).toBeGreaterThan(2 * 3600_000);
  });

  it('learning steps do not consume the review cap', () => {
    const logs: ReviewLog[] = [];
    let card = makeCard();
    for (let i = 0; i < 6; i++) card = review(card, 'recognition', 1, T0 + i * 60_000, logs);
    const q = buildQueue([card], logs, SETTINGS, T0 + 10 * 60_000);
    expect(q.counts.reviewsDoneToday).toBe(0);
    expect(q.counts.newDoneToday).toBe(1);
  });

  it('applyReview is pure and labels its log correctly', () => {
    const card = makeCard();
    const r = applyReview(card, 'recognition', 3, T0, 0.9, 4200);
    expect(card.srs.recognition.state).toBe(0);
    expect(r.log).toMatchObject({ cardId: card.id, direction: 'recognition', rating: 3, stateBefore: 0, stateAfter: 1, durationMs: 4200 });
    expect(r.card.srs.production).toEqual(card.srs.production);
  });
});
