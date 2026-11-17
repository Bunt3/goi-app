import { addDays, endOfDay, startOfDay } from '../day';
import { DIRECTIONS, SrsPhase, isInbox, type Card, type Direction, type ReviewLog, type Settings } from '../types';
import { retrievability } from './fsrs';

export type QueueSettings = Pick<
  Settings,
  'maxReviewsPerDay' | 'maxNewPerDay' | 'pauseNewDuringBacklog' | 'requestRetention'
>;

export interface QueueItem {
  cardId: string;
  direction: Direction;
  kind: 'learning' | 'review' | 'new';
  due: number;
  /** Recall probability now; set for reviews only. */
  retrievability: number;
}

export interface Queue {
  /** Cards in (re)learning steps, earliest due first. Not capped: they are already in flight. */
  learning: QueueItem[];
  /** Today's reviews (lowest retrievability first) with new cards spaced evenly between them. */
  main: QueueItem[];
  counts: {
    learning: number;
    review: number;
    new: number;
    /** Due reviews that did not fit under today's cap and roll to the following days. */
    deferred: number;
    /** Held back because the card's other direction is being studied today. */
    buried: number;
    reviewsDoneToday: number;
    newDoneToday: number;
    newPaused: boolean;
    /** New cards (either direction) that are available but over today's new cap. */
    newWaiting: number;
  };
}

/** How far ahead a learning step may be shown when nothing else is left. */
export const LEARN_AHEAD_MS = 20 * 60_000;

export function countDone(todayLogs: ReviewLog[]): { reviews: number; fresh: number } {
  let reviews = 0;
  let fresh = 0;
  for (const l of todayLogs) {
    if (l.rating === 0) continue;
    if (l.stateBefore === SrsPhase.Review) reviews++;
    else if (l.stateBefore === SrsPhase.New) fresh++;
  }
  return { reviews, fresh };
}

/**
 * Build today's study queue. Pure and stateless: nothing is rescheduled when
 * days are missed. Overdue cards simply stay due, each day takes the
 * `maxReviewsPerDay` cards with the lowest recall probability, and the rest
 * roll forward — so a backlog spreads itself over the following days.
 *
 * `todayLogs` must contain every review log since `startOfDay(now)`.
 */
export function buildQueue(cards: Iterable<Card>, todayLogs: ReviewLog[], settings: QueueSettings, now: number): Queue {
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const done = countDone(todayLogs.filter((l) => l.reviewedAt >= dayStart));

  // Which direction of each card is already "in play" today. The other
  // direction is buried until tomorrow so one doesn't give away the other.
  const inPlay = new Map<string, Direction>();
  for (const l of todayLogs) if (l.reviewedAt >= dayStart && l.rating !== 0) inPlay.set(l.cardId, l.direction);

  const learning: QueueItem[] = [];
  const reviewPool: QueueItem[] = [];
  const newProduction: { item: QueueItem; order: number; id: string }[] = [];
  const newRecognition: { item: QueueItem; order: number; id: string }[] = [];

  for (const card of cards) {
    if (card.deleted || isInbox(card)) continue;
    for (const direction of DIRECTIONS) {
      const s = card.srs[direction];
      if (s.state === SrsPhase.Learning || s.state === SrsPhase.Relearning) {
        if (s.due < dayEnd) {
          learning.push({ cardId: card.id, direction, kind: 'learning', due: s.due, retrievability: 0 });
          if (!inPlay.has(card.id)) inPlay.set(card.id, direction);
        }
      } else if (s.state === SrsPhase.Review) {
        if (s.due < dayEnd) {
          reviewPool.push({
            cardId: card.id,
            direction,
            kind: 'review',
            due: s.due,
            retrievability: retrievability(s, now, settings.requestRetention),
          });
        }
      } else if (direction === 'recognition') {
        newRecognition.push({
          item: { cardId: card.id, direction, kind: 'new', due: s.due, retrievability: 0 },
          order: card.created,
          id: card.id,
        });
      } else if (card.productionUnlockedAt != null && card.productionUnlockedAt < dayStart) {
        // Production becomes available the day after recognition first succeeds.
        newProduction.push({
          item: { cardId: card.id, direction, kind: 'new', due: s.due, retrievability: 0 },
          order: card.productionUnlockedAt,
          id: card.id,
        });
      }
    }
  }

  learning.sort((a, b) => a.due - b.due || a.cardId.localeCompare(b.cardId));
  reviewPool.sort(
    (a, b) => a.retrievability - b.retrievability || a.due - b.due || a.cardId.localeCompare(b.cardId),
  );

  let buried = 0;
  const take = (item: QueueItem): boolean => {
    const other = inPlay.get(item.cardId);
    if (other && other !== item.direction) {
      buried++;
      return false;
    }
    inPlay.set(item.cardId, item.direction);
    return true;
  };

  const reviewBudget = Math.max(0, settings.maxReviewsPerDay - done.reviews);
  const reviews: QueueItem[] = [];
  let deferred = 0;
  for (const item of reviewPool) {
    if (reviews.length >= reviewBudget) {
      const other = inPlay.get(item.cardId);
      if (other && other !== item.direction) buried++;
      else deferred++;
      continue;
    }
    if (take(item)) reviews.push(item);
  }

  const byOrder = <T extends { order: number; id: string }>(a: T, b: T) => a.order - b.order || a.id.localeCompare(b.id);
  // Finish what's started: unlocked production cards come before brand-new words.
  const newPool = [...newProduction.sort(byOrder), ...newRecognition.sort(byOrder)].map((x) => x.item);
  const newPaused = settings.pauseNewDuringBacklog && deferred > 0;
  const newBudget = newPaused ? 0 : Math.max(0, settings.maxNewPerDay - done.fresh);
  const fresh: QueueItem[] = [];
  let newWaiting = 0;
  for (const item of newPool) {
    if (fresh.length >= newBudget) {
      newWaiting++;
      continue;
    }
    if (take(item)) fresh.push(item);
  }

  return {
    learning,
    main: interleave(reviews, fresh),
    counts: {
      learning: learning.length,
      review: reviews.length,
      new: fresh.length,
      deferred,
      buried,
      reviewsDoneToday: done.reviews,
      newDoneToday: done.fresh,
      newPaused,
      newWaiting,
    },
  };
}

/** Spread `b` evenly through `a`, never opening with a `b` item unless `a` is empty. */
function interleave<T>(a: T[], b: T[]): T[] {
  if (b.length === 0) return [...a];
  if (a.length === 0) return [...b];
  const out: T[] = [];
  const gap = a.length / (b.length + 1);
  let bi = 0;
  for (let ai = 0; ai < a.length; ai++) {
    out.push(a[ai]!);
    while (bi < b.length && ai + 1 >= Math.round(gap * (bi + 1))) out.push(b[bi++]!);
  }
  while (bi < b.length) out.push(b[bi++]!);
  return out;
}

export interface NextPick {
  item: QueueItem | null;
  /** When item is null: ms until the next learning card comes back today, if any. */
  waitMs: number | null;
}

/** Choose the next card to show from a freshly built queue. */
export function pickNext(queue: Queue, now: number, avoid?: { cardId: string; direction: Direction }): NextPick {
  const dueLearning = queue.learning.filter((i) => i.due <= now);
  if (dueLearning.length) return { item: dueLearning[0]!, waitMs: null };
  if (queue.main.length) return { item: queue.main[0]!, waitMs: null };
  const ahead = queue.learning.filter((i) => i.due <= now + LEARN_AHEAD_MS);
  if (ahead.length) {
    // Prefer not to re-show the card that was just answered if another is available.
    const other = avoid && ahead.find((i) => !(i.cardId === avoid.cardId && i.direction === avoid.direction));
    return { item: other ?? ahead[0]!, waitMs: null };
  }
  const later = queue.learning[0];
  return { item: null, waitMs: later ? later.due - now : null };
}

export interface ForecastDay {
  /** Start-of-day timestamp. */
  day: number;
  /** Reviews that become due that day (day 0 includes everything overdue). */
  due: number;
  /** Reviews that will actually be shown under the cap. */
  shown: number;
  /** Reviews pushed to the next day by the cap. */
  carried: number;
}

/**
 * Project the review load of existing cards over the coming days, applying
 * the daily cap the same way buildQueue does. Counts only cards already in
 * review; it does not guess at reviews created by cards you study meanwhile.
 */
export function forecast(
  cards: Iterable<Card>,
  todayLogs: ReviewLog[],
  settings: QueueSettings,
  now: number,
  days = 7,
): ForecastDay[] {
  const dayStart = startOfDay(now);
  const buckets = new Array<number>(days).fill(0);
  for (const card of cards) {
    if (card.deleted || isInbox(card)) continue;
    for (const direction of DIRECTIONS) {
      const s = card.srs[direction];
      if (s.state !== SrsPhase.Review) continue;
      let idx = 0;
      while (idx < days && s.due >= addDays(dayStart, idx + 1)) idx++;
      if (idx < days) buckets[idx]!++;
    }
  }
  const doneToday = countDone(todayLogs.filter((l) => l.reviewedAt >= dayStart)).reviews;
  const out: ForecastDay[] = [];
  let carry = 0;
  for (let i = 0; i < days; i++) {
    const cap = i === 0 ? Math.max(0, settings.maxReviewsPerDay - doneToday) : settings.maxReviewsPerDay;
    const available = carry + buckets[i]!;
    const shown = Math.min(cap, available);
    carry = available - shown;
    out.push({ day: addDays(dayStart, i), due: buckets[i]!, shown, carried: carry });
  }
  return out;
}

/** Days until a deferred backlog is fully absorbed under the cap (0 = no backlog). */
export function backlogDays(cards: Iterable<Card>, todayLogs: ReviewLog[], settings: QueueSettings, now: number): number {
  const f = forecast(cards, todayLogs, settings, now, 60);
  if (f[0]!.carried === 0) return 0;
  const clear = f.findIndex((d) => d.carried === 0);
  return clear === -1 ? 60 : clear;
}
