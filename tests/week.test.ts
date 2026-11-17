import { describe, expect, it } from 'vitest';
import { DAY } from './helpers';
import { T0, makeCard, review } from './helpers';
import { sourceGroup, sourceGroups, weekSummary } from '../src/week';
import type { ReviewLog } from '../src/types';

describe('where you met it', () => {
  it('groups by the automatic source, leaving starter decks out', () => {
    expect(sourceGroup({ source: 'email from 総務' })).toBe('email from 総務');
    expect(sourceGroup({ source: 'example sentence for 承る' })).toBe('From example sentences');
    expect(sourceGroup({ source: 'dictionary' })).toBe('Dictionary');
    expect(sourceGroup({ source: 'seed deck' })).toBeNull();
    expect(sourceGroup({ source: 'Modern slang starter deck · documented: 三省堂' })).toBeNull();
    expect(sourceGroup({ source: '' })).toBeNull();
  });

  it('lists groups with counts, most recent first', () => {
    const cards = [
      makeCard({ source: 'meeting', created: T0 - 3 * DAY }),
      makeCard({ source: 'meeting', created: T0 - 2 * DAY }),
      makeCard({ source: 'email', created: T0 - DAY }),
      makeCard({ source: 'seed deck', created: T0 }),
    ];
    expect(sourceGroups(cards)).toEqual([
      { group: 'email', count: 1, latest: T0 - DAY },
      { group: 'meeting', count: 2, latest: T0 - 2 * DAY },
    ]);
  });
});

describe('the weekly look-back', () => {
  it('counts your own new words, reviews, recall and words that keep slipping', () => {
    const logs: ReviewLog[] = [];
    let a = makeCard({ word: '握る', source: 'meeting', created: T0 - 2 * DAY });
    const b = makeCard({ word: '温度感', source: 'meeting', created: T0 - DAY });
    const old = makeCard({ word: '古い', source: 'meeting', created: T0 - 30 * DAY });
    const pack = makeCard({ word: 'エモい', source: 'Modern slang starter deck', created: T0 - DAY });
    a = review(a, 'recognition', 1, T0 - 2 * DAY, logs);
    a = review(a, 'recognition', 1, T0 - 2 * DAY + 60_000, logs);
    a = review(a, 'recognition', 3, T0 - 2 * DAY + 700_000, logs);
    const tooOld: ReviewLog = { ...logs[0]!, id: 'x', reviewedAt: T0 - 20 * DAY, rating: 1 };
    const s = weekSummary([a, b, old, pack], [...logs, tooOld], T0);
    expect(s.added).toBe(2);
    expect(s.addedFrom).toEqual([{ group: 'meeting', count: 2 }]);
    expect(s.reviews).toBe(3);
    expect(s.slipping.map((x) => [x.card.word, x.again])).toEqual([['握る', 2]]);
    expect(s.matureReviews).toBe(0);
  });

  it('is empty, not negative, for a quiet week', () => {
    const s = weekSummary([], [], T0);
    expect([s.added, s.reviews, s.graduated, s.slipping.length]).toEqual([0, 0, 0, 0]);
  });
});
