import { createCard } from '../src/cards';
import { applyReview, type Rating } from '../src/srs/fsrs';
import type { Card, Direction, ReviewLog } from '../src/types';

export const DAY = 86_400_000;
/** 2026-11-17 10:00 JST — mid study-day, well clear of the 04:00 rollover. */
export const T0 = new Date('2026-11-17T10:00:00+09:00').getTime();

let n = 0;
export function makeCard(over: Partial<Card> = {}, now = T0): Card {
  n++;
  return {
    ...createCard({ word: `語${n}`, reading: `ご${n}`, meaning_en: `word ${n}` }, now, `card-${String(n).padStart(4, '0')}`),
    ...over,
  };
}

/** Review a card and collect the log. */
export function review(
  card: Card,
  direction: Direction,
  rating: Rating,
  at: number,
  logs: ReviewLog[] = [],
  retention = 0.9,
): Card {
  const r = applyReview(card, direction, rating, at, retention);
  logs.push(r.log);
  return r.card;
}

/**
 * A card whose recognition side is in Review state, last reviewed `agoDays`
 * before `now` with the given interval — i.e. due `interval - agoDays` days from now.
 */
export function reviewCard(now: number, agoDays: number, intervalDays: number, over: Partial<Card> = {}): Card {
  const c = makeCard(over, now - 100 * DAY);
  const last = now - agoDays * DAY;
  return {
    ...c,
    productionUnlockedAt: null,
    srs: {
      ...c.srs,
      recognition: {
        due: last + intervalDays * DAY,
        stability: intervalDays,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: intervalDays,
        learning_steps: 0,
        reps: 3,
        lapses: 0,
        state: 2,
        last_review: last,
      },
    },
  };
}

export const SETTINGS = { maxReviewsPerDay: 40, maxNewPerDay: 8, pauseNewDuringBacklog: true, requestRetention: 0.9 };
