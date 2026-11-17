import { describe, expect, it } from 'vitest';
import { cardsToCheck, checkCounts } from '../src/check';
import { T0, makeCard } from './helpers';

describe('checker mode', () => {
  const ok = makeCard({ deck: 'Slang', check: { verdict: 'ok', note: '', by: '', at: T0 } });
  const fix = makeCard({ deck: 'Slang', check: { verdict: 'fix', note: '言い方が古い', by: 'A', at: T0 } });
  const wrong = makeCard({ deck: '', check: { verdict: 'wrong', note: '', by: '', at: T0 } });
  const fresh = makeCard({ deck: 'Slang' });
  const mine = makeCard({ deck: '' });
  const gone = makeCard({ deck: 'Slang', deleted: true });
  const all = [ok, fix, wrong, fresh, mine, gone];

  it('offers unchecked cards from the chosen decks only', () => {
    expect(cardsToCheck(all, ['Slang'], 'unchecked')).toEqual([fresh]);
    expect(cardsToCheck(all, [], 'unchecked').map((c) => c.id).sort()).toEqual([fresh.id, mine.id].sort());
  });

  it('lists fixes and wrongs as flagged, never natural ones', () => {
    expect(cardsToCheck(all, [], 'flagged').map((c) => c.id).sort()).toEqual([fix.id, wrong.id].sort());
  });

  it('counts by verdict, ignoring deleted cards', () => {
    expect(checkCounts(all)).toEqual({ unchecked: 2, ok: 1, fix: 1, wrong: 1 });
    expect(checkCounts(all, ['Slang'])).toEqual({ unchecked: 1, ok: 1, fix: 1, wrong: 0 });
  });
});
