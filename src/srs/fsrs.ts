import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type FSRS, type Grade } from 'ts-fsrs';
import { SrsPhase, type Card, type Direction, type ReviewLog, type SrsState } from '../types';
import { uuid } from '../util';

export type Rating = 1 | 2 | 3 | 4;
export const RATINGS: Rating[] = [1, 2, 3, 4];
export const RATING_LABEL: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

const schedulers = new Map<number, FSRS>();

/** FSRS-6 scheduler (ts-fsrs defaults: learning steps 1m/10m, relearning 10m, fuzz on). */
export function scheduler(requestRetention: number): FSRS {
  const key = Math.round(requestRetention * 1000);
  let f = schedulers.get(key);
  if (!f) {
    f = fsrs(generatorParameters({ request_retention: key / 1000, enable_fuzz: true, enable_short_term: true }));
    schedulers.set(key, f);
  }
  return f;
}

export function newSrs(now: number): SrsState {
  return fromFsrs(createEmptyCard(new Date(now)));
}

export function toFsrs(s: SrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review == null ? undefined : new Date(s.last_review),
  };
}

export function fromFsrs(c: FsrsCard): SrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as SrsState['state'],
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

/** Probability of recall right now (0–1). Only meaningful once a card has been reviewed. */
export function retrievability(s: SrsState, now: number, requestRetention: number): number {
  if (s.state === SrsPhase.New) return 0;
  return scheduler(requestRetention).get_retrievability(toFsrs(s), new Date(now), false);
}

/** The state each of the four answers would produce, for labelling the buttons. */
export function previewRatings(s: SrsState, now: number, requestRetention: number): Record<Rating, SrsState> {
  const rec = scheduler(requestRetention).repeat(toFsrs(s), new Date(now));
  return {
    1: fromFsrs(rec[1 as Grade].card),
    2: fromFsrs(rec[2 as Grade].card),
    3: fromFsrs(rec[3 as Grade].card),
    4: fromFsrs(rec[4 as Grade].card),
  };
}

export function formatInterval(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return '<1m';
  if (min < 60) return `${Math.round(min)}m`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30.5) return `${Math.round(days)}d`;
  if (days < 365) return `${trim(days / 30.44)}mo`;
  return `${trim(days / 365.25)}y`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** Did this review count as "successful recognition" (which unlocks production)? */
function unlocksProduction(direction: Direction, rating: number, stateAfter: number): boolean {
  return direction === 'recognition' && rating >= 2 && stateAfter === SrsPhase.Review;
}

export interface ReviewResult {
  card: Card;
  log: ReviewLog;
}

/** Pure: returns the updated card and the log entry; the caller persists both. */
export function applyReview(
  card: Card,
  direction: Direction,
  rating: Rating,
  now: number,
  requestRetention: number,
  durationMs = 0,
): ReviewResult {
  const before = card.srs[direction];
  const item = scheduler(requestRetention).next(toFsrs(before), new Date(now), rating as Grade);
  const after = fromFsrs(item.card);
  const log: ReviewLog = {
    id: uuid(),
    cardId: card.id,
    direction,
    rating,
    reviewedAt: now,
    stateBefore: before.state,
    stateAfter: after.state,
    elapsedDays: before.last_review == null ? 0 : Math.max(0, (now - before.last_review) / 86_400_000),
    scheduledDays: after.scheduled_days,
    durationMs,
  };
  const next: Card = {
    ...card,
    srs: { ...card.srs, [direction]: after },
    productionUnlockedAt:
      card.productionUnlockedAt ?? (unlocksProduction(direction, rating, after.state) ? now : null),
  };
  return { card: next, log };
}

/** Pure: forget all progress in both directions. Logged as rating 0 so merges can replay it. */
export function resetProgress(card: Card, now: number): { card: Card; logs: ReviewLog[] } {
  const logs: ReviewLog[] = (['recognition', 'production'] as Direction[]).map((direction) => ({
    id: uuid(),
    cardId: card.id,
    direction,
    rating: 0,
    reviewedAt: now,
    stateBefore: card.srs[direction].state,
    stateAfter: SrsPhase.New,
    elapsedDays: 0,
    scheduledDays: 0,
    durationMs: 0,
  }));
  return {
    card: { ...card, srs: { recognition: newSrs(now), production: newSrs(now) }, productionUnlockedAt: null },
    logs,
  };
}

/**
 * Rebuild one direction's FSRS state from its review history. Used by merge
 * when two devices have each reviewed the same card since they last synced.
 */
export function replayLogs(
  created: number,
  logs: ReviewLog[],
  requestRetention: number,
): { srs: SrsState; unlockedAt: number | null } {
  const f = scheduler(requestRetention);
  const ordered = [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id));
  let state = createEmptyCard(new Date(created));
  let unlockedAt: number | null = null;
  for (const log of ordered) {
    if (log.rating === 0) {
      state = createEmptyCard(new Date(log.reviewedAt));
      if (log.direction === 'recognition') unlockedAt = null;
      continue;
    }
    state = f.next(state, new Date(log.reviewedAt), log.rating as Grade).card;
    if (unlockedAt == null && unlocksProduction(log.direction, log.rating, state.state)) unlockedAt = log.reviewedAt;
  }
  return { srs: fromFsrs(state), unlockedAt };
}
