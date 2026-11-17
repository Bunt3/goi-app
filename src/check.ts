/** Checker mode: which cards to show a native speaker, and the tallies. Pure. */
import { inDecks } from './decks';
import type { Card } from './types';

export type CheckFilter = 'unchecked' | 'flagged';

/** Cards to go through: live, in the chosen decks (none chosen = all), oldest first within each deck. */
export function cardsToCheck(cards: Iterable<Card>, decks: readonly string[], filter: CheckFilter): Card[] {
  const out: Card[] = [];
  for (const c of cards) {
    if (c.deleted || !inDecks(c, decks)) continue;
    if (filter === 'unchecked' ? c.check === null : c.check !== null && c.check.verdict !== 'ok') out.push(c);
  }
  return out.sort((a, b) => a.deck.localeCompare(b.deck, 'ja') || a.created - b.created || a.id.localeCompare(b.id));
}

export interface CheckCounts {
  unchecked: number;
  ok: number;
  fix: number;
  wrong: number;
}

export function checkCounts(cards: Iterable<Card>, decks: readonly string[] = []): CheckCounts {
  const n: CheckCounts = { unchecked: 0, ok: 0, fix: 0, wrong: 0 };
  for (const c of cards) {
    if (c.deleted || !inDecks(c, decks)) continue;
    if (c.check === null) n.unchecked++;
    else n[c.check.verdict]++;
  }
  return n;
}
