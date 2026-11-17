/**
 * The weekly look-back and "where you met it" grouping. Pure. No streaks and
 * no judgement: what happened, where words came from, which ones keep slipping.
 */
import { DAY_MS, startOfDay } from './day';
import { SrsPhase, type Card, type ReviewLog } from './types';

/**
 * A card's "where from" group, from its Source field (filled automatically by
 * Capture, sharing, the picker and the dictionary). Starter-deck cards return
 * null: their deck already says where they came from.
 */
export function sourceGroup(card: Pick<Card, 'source'>): string | null {
  const s = card.source.trim();
  if (!s || s === 'seed deck' || / starter deck( · |$)/.test(s)) return null;
  if (s === 'dictionary') return 'Dictionary';
  if (s.startsWith('example sentence for ')) return 'From example sentences';
  return s;
}

/** Where-from groups with their card counts, most recently used first. */
export function sourceGroups(cards: Iterable<Card>): { group: string; count: number; latest: number }[] {
  const map = new Map<string, { count: number; latest: number }>();
  for (const c of cards) {
    if (c.deleted) continue;
    const g = sourceGroup(c);
    if (!g) continue;
    const cur = map.get(g) ?? { count: 0, latest: 0 };
    cur.count++;
    cur.latest = Math.max(cur.latest, c.created);
    map.set(g, cur);
  }
  return [...map.entries()].map(([group, v]) => ({ group, ...v })).sort((a, b) => b.latest - a.latest || a.group.localeCompare(b.group));
}

export interface WeekSummary {
  /** Start of the 7-study-day window (epoch ms). */
  since: number;
  /** Words you added yourself (not loaded from a starter deck). */
  added: number;
  /** Where those came from, most first (top 4). */
  addedFrom: { group: string; count: number }[];
  /** Answers given (resets excluded). */
  reviews: number;
  /** Reviews of already-learned cards, and how many were remembered. */
  matureReviews: number;
  remembered: number;
  /** Cards that reached the review stage this week (either direction). */
  graduated: number;
  /** Cards answered Again at least twice this week, most-missed first (top 5). */
  slipping: { card: Card; again: number }[];
}

export function weekSummary(cards: Iterable<Card>, logs: ReviewLog[], now: number): WeekSummary {
  const since = startOfDay(now) - 6 * DAY_MS;
  const byId = new Map<string, Card>();
  for (const c of cards) if (!c.deleted) byId.set(c.id, c);

  const fromCounts = new Map<string, number>();
  let added = 0;
  for (const c of byId.values()) {
    if (c.created < since || c.created > now) continue;
    const s = c.source.trim();
    if (s === 'seed deck' || / starter deck( · |$)/.test(s)) continue;
    added++;
    const g = sourceGroup(c) ?? 'Typed in';
    fromCounts.set(g, (fromCounts.get(g) ?? 0) + 1);
  }

  const week = logs.filter((l) => l.reviewedAt >= since && l.reviewedAt <= now && l.rating !== 0);
  const mature = week.filter((l) => l.stateBefore === SrsPhase.Review);
  const graduatedIds = new Set(week.filter((l) => l.stateBefore !== SrsPhase.Review && l.stateAfter === SrsPhase.Review).map((l) => l.cardId));
  const againCounts = new Map<string, number>();
  for (const l of week) if (l.rating === 1) againCounts.set(l.cardId, (againCounts.get(l.cardId) ?? 0) + 1);

  return {
    since,
    added,
    addedFrom: [...fromCounts.entries()]
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group))
      .slice(0, 4),
    reviews: week.length,
    matureReviews: mature.length,
    remembered: mature.filter((l) => l.rating >= 2).length,
    graduated: [...graduatedIds].filter((id) => byId.has(id)).length,
    slipping: [...againCounts.entries()]
      .filter(([id, n]) => n >= 2 && byId.has(id))
      .map(([id, again]) => ({ card: byId.get(id)!, again }))
      .sort((a, b) => b.again - a.again || a.card.word.localeCompare(b.card.word))
      .slice(0, 5),
  };
}
