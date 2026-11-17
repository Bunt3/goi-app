import { describe, expect, it } from 'vitest';
import { isNoop, planMerge } from '../src/data/merge';
import { replayLogs } from '../src/srs/fsrs';
import type { Card, ReviewLog } from '../src/types';
import { DAY, T0, makeCard, review } from './helpers';

const R = 0.9;
/** Apply a plan the way the store does: put cards by id, append logs. */
function apply(cards: Card[], logs: ReviewLog[], plan: ReturnType<typeof planMerge>) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const c of plan.cards) byId.set(c.id, c);
  return { cards: [...byId.values()], logs: [...logs, ...plan.logs] };
}
const find = (cards: Card[], id: string) => cards.find((c) => c.id === id)!;

describe('merge: same card edited on two devices', () => {
  const base = makeCard({ word: '稟議', reading: 'りんぎ', meaning_en: 'approval request', updated: T0 });

  it('takes the file version when it was edited later', () => {
    const phone = { ...base, meaning_en: 'phone edit', updated: T0 + 1000 };
    const desktop = { ...base, meaning_en: 'circulating a proposal for approval', tags: ['会議'], updated: T0 + 5000 };
    const plan = planMerge([phone], [], { cards: [desktop], reviewLogs: [] }, R);
    expect(plan.summary.cardsUpdatedFromFile).toBe(1);
    expect(plan.summary.cardsKeptLocal).toBe(0);
    const merged = find(apply([phone], [], plan).cards, base.id);
    expect(merged.meaning_en).toBe('circulating a proposal for approval');
    expect(merged.tags).toEqual(['会議']);
    expect(merged.updated).toBe(T0 + 5000);
  });

  it('keeps the local version when it was edited later', () => {
    const phone = { ...base, meaning_en: 'phone edit', updated: T0 + 9000 };
    const desktop = { ...base, meaning_en: 'desktop edit', updated: T0 + 5000 };
    const plan = planMerge([phone], [], { cards: [desktop], reviewLogs: [] }, R);
    expect(plan.summary.cardsKeptLocal).toBe(1);
    expect(plan.summary.cardsUpdatedFromFile).toBe(0);
    expect(plan.cards).toHaveLength(0);
    expect(isNoop(plan.summary)).toBe(true);
  });

  it('gives the same result whichever device does the merging', () => {
    const phone = { ...base, meaning_en: 'phone edit', updated: T0 + 1000 };
    const desktop = { ...base, meaning_en: 'desktop edit', updated: T0 + 5000 };
    const onPhone = apply([phone], [], planMerge([phone], [], { cards: [desktop], reviewLogs: [] }, R));
    const onDesktop = apply([desktop], [], planMerge([desktop], [], { cards: [phone], reviewLogs: [] }, R));
    expect(onPhone.cards).toEqual(onDesktop.cards);
  });

  it('keeps review progress when the other device only edited the text', () => {
    const logs: ReviewLog[] = [];
    const phone = review(review(base, 'recognition', 3, T0 + 100, logs), 'recognition', 3, T0 + 700_000, logs);
    const desktop = { ...base, meaning_en: 'desktop edit', updated: T0 + 5000 }; // never reviewed there
    const plan = planMerge([phone], logs, { cards: [desktop], reviewLogs: [] }, R);
    const merged = find(apply([phone], logs, plan).cards, base.id);
    expect(merged.meaning_en).toBe('desktop edit'); // text from the newer edit
    expect(merged.srs).toEqual(phone.srs); // progress from the device that reviewed
    expect(merged.productionUnlockedAt).toBe(phone.productionUnlockedAt);
  });

  it('takes text from one side and progress from the other when each is newer', () => {
    const logs: ReviewLog[] = [];
    const desktop = review({ ...base, updated: T0 }, 'recognition', 4, T0 + 100, logs);
    const phone = { ...base, example_ja: '稟議を上げる。', updated: T0 + 5000 };
    const plan = planMerge([phone], [], { cards: [desktop], reviewLogs: logs }, R);
    expect(plan.summary.cardsKeptLocal).toBe(1);
    expect(plan.summary.progressFromFile).toBe(1);
    const merged = find(apply([phone], [], plan).cards, base.id);
    expect(merged.example_ja).toBe('稟議を上げる。');
    expect(merged.srs.recognition).toEqual(desktop.srs.recognition);
    expect(merged.productionUnlockedAt).toBe(T0 + 100);
  });

  it('rebuilds progress from the combined history when both devices reviewed', () => {
    const shared: ReviewLog[] = [];
    const synced = review(base, 'recognition', 4, T0, shared);
    const phoneLogs = [...shared];
    const desktopLogs = [...shared];
    const phone = review(synced, 'recognition', 3, T0 + 5 * DAY, phoneLogs);
    const desktop = review(synced, 'recognition', 1, T0 + 9 * DAY, desktopLogs);

    const plan = planMerge([phone], phoneLogs, { cards: [desktop], reviewLogs: desktopLogs }, R);
    expect(plan.summary.progressReplayed).toBe(1);
    expect(plan.summary.logsAdded).toBe(1);
    expect(plan.summary.logsDuplicate).toBe(1);
    const merged = apply([phone], phoneLogs, plan);
    const state = find(merged.cards, base.id).srs.recognition;
    expect(state.reps).toBe(3);
    expect(state.lapses).toBe(1);
    expect(state.last_review).toBe(T0 + 9 * DAY);
    expect(state).toEqual(replayLogs(base.created, merged.logs, R).srs);

    // The other device, merging the other way, converges on the same state.
    const reverse = apply(desktopLogs.length ? [desktop] : [], desktopLogs, planMerge([desktop], desktopLogs, { cards: [phone], reviewLogs: phoneLogs }, R));
    expect(find(reverse.cards, base.id).srs.recognition).toEqual(state);
  });

  it('merges the two directions independently', () => {
    const shared: ReviewLog[] = [];
    let synced = review(base, 'recognition', 4, T0, shared);
    synced = review(synced, 'production', 4, T0 + DAY, shared);
    const phoneLogs = [...shared];
    const desktopLogs = [...shared];
    const phone = review(synced, 'recognition', 3, T0 + 20 * DAY, phoneLogs);
    const desktop = review(synced, 'production', 3, T0 + 21 * DAY, desktopLogs);
    const plan = planMerge([phone], phoneLogs, { cards: [desktop], reviewLogs: desktopLogs }, R);
    const merged = find(apply([phone], phoneLogs, plan).cards, base.id);
    expect(merged.srs.recognition).toEqual(phone.srs.recognition);
    expect(merged.srs.production).toEqual(desktop.srs.production);
    expect(plan.summary.progressFromFile).toBe(1);
    expect(plan.summary.progressReplayed).toBe(0);
  });

  it('propagates a deletion, unless the card was edited after it was deleted', () => {
    const live = { ...base, updated: T0 };
    const tombstone = { ...base, deleted: true, updated: T0 + 1000 };
    const plan = planMerge([live], [], { cards: [tombstone], reviewLogs: [] }, R);
    expect(plan.summary.cardsDeleted).toBe(1);
    expect(find(apply([live], [], plan).cards, base.id).deleted).toBe(true);

    const editedLater = { ...base, meaning_en: 'rewritten', updated: T0 + 2000 };
    const plan2 = planMerge([editedLater], [], { cards: [tombstone], reviewLogs: [] }, R);
    expect(plan2.summary.cardsDeleted).toBe(0);
    expect(plan2.summary.cardsKeptLocal).toBe(1);

    // And a local deletion is not undone by an older live copy in the file.
    const plan3 = planMerge([tombstone], [], { cards: [live], reviewLogs: [] }, R);
    expect(plan3.cards).toHaveLength(0);
  });
});

describe('merge: card on only one device', () => {
  it('adds a card that exists only in the file, with its logs and progress', () => {
    const logs: ReviewLog[] = [];
    const mine = makeCard();
    const theirs = review(makeCard({ word: '査収' }), 'recognition', 4, T0, logs);
    const plan = planMerge([mine], [], { cards: [theirs], reviewLogs: logs }, R);
    expect(plan.summary).toMatchObject({ cardsAdded: 1, cardsOnlyLocal: 1, logsAdded: 1, cardsUpdatedFromFile: 0 });
    const merged = apply([mine], [], plan);
    expect(merged.cards).toHaveLength(2);
    expect(find(merged.cards, theirs.id)).toEqual(theirs);
    expect(find(merged.cards, mine.id)).toEqual(mine);
    expect(merged.logs).toEqual(logs);
  });

  it('leaves a card that exists only on this device untouched', () => {
    const logs: ReviewLog[] = [];
    const mine = review(makeCard(), 'recognition', 3, T0, logs);
    const plan = planMerge([mine], logs, { cards: [], reviewLogs: [] }, R);
    expect(plan.cards).toHaveLength(0);
    expect(plan.logs).toHaveLength(0);
    expect(plan.summary.cardsOnlyLocal).toBe(1);
    expect(isNoop(plan.summary)).toBe(true);
  });

  it('restores everything into an empty device', () => {
    const logs: ReviewLog[] = [];
    const cards = [review(makeCard(), 'recognition', 3, T0, logs), makeCard(), makeCard({ deleted: true })];
    const plan = planMerge([], [], { cards, reviewLogs: logs }, R);
    expect(plan.summary.cardsAdded).toBe(2); // the tombstone is carried over but not counted
    expect(apply([], [], plan).cards).toEqual(cards);
  });
});

describe('merge: duplicate review logs', () => {
  it('skips logs that are already present by id', () => {
    const logs: ReviewLog[] = [];
    const card = review(review(makeCard(), 'recognition', 3, T0, logs), 'recognition', 3, T0 + 700_000, logs);
    const plan = planMerge([card], logs, { cards: [card], reviewLogs: logs }, R);
    expect(plan.summary.logsDuplicate).toBe(2);
    expect(plan.summary.logsAdded).toBe(0);
    expect(isNoop(plan.summary)).toBe(true);
    expect(apply([card], logs, plan).logs).toHaveLength(2);
  });

  it('skips the same review recorded under a different id', () => {
    const logs: ReviewLog[] = [];
    const card = review(makeCard(), 'recognition', 3, T0, logs);
    const renamed = logs.map((l) => ({ ...l, id: 'other-' + l.id }));
    const plan = planMerge([card], logs, { cards: [card], reviewLogs: renamed }, R);
    expect(plan.summary.logsDuplicate).toBe(1);
    expect(plan.logs).toHaveLength(0);
  });

  it('skips duplicates inside the file itself', () => {
    const logs: ReviewLog[] = [];
    const card = review(makeCard(), 'recognition', 3, T0, logs);
    const plan = planMerge([], [], { cards: [card], reviewLogs: [...logs, ...logs] }, R);
    expect(plan.summary.logsAdded).toBe(1);
    expect(plan.summary.logsDuplicate).toBe(1);
  });

  it('importing the same file twice changes nothing the second time', () => {
    const logs: ReviewLog[] = [];
    const theirs = [review(makeCard(), 'recognition', 4, T0, logs), makeCard()];
    const first = apply([], [], planMerge([], [], { cards: theirs, reviewLogs: logs }, R));
    const second = planMerge(first.cards, first.logs, { cards: theirs, reviewLogs: logs }, R);
    expect(isNoop(second.summary)).toBe(true);
    expect(second.cards).toHaveLength(0);
  });

  it('an older backup of this device never rolls progress back', () => {
    const logs: ReviewLog[] = [];
    const old = review(makeCard(), 'recognition', 4, T0, logs);
    const oldLogs = [...logs];
    const current = review(old, 'recognition', 3, T0 + 10 * DAY, logs);
    const plan = planMerge([current], logs, { cards: [old], reviewLogs: oldLogs }, R);
    expect(isNoop(plan.summary)).toBe(true);
  });

  it('a progress reset on one device wins over older reviews on the other', () => {
    const shared: ReviewLog[] = [];
    const synced = review(makeCard(), 'recognition', 4, T0, shared);
    const reset: ReviewLog = {
      id: 'reset-1', cardId: synced.id, direction: 'recognition', rating: 0, reviewedAt: T0 + DAY,
      stateBefore: 2, stateAfter: 0, elapsedDays: 0, scheduledDays: 0, durationMs: 0,
    };
    const rebuilt = replayLogs(synced.created, [...shared, reset], R);
    expect(rebuilt.srs.state).toBe(0);
    expect(rebuilt.srs.reps).toBe(0);
    expect(rebuilt.unlockedAt).toBeNull();
  });
});
