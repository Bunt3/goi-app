/** Decks: a name on each card. Pure. */
import { DEFAULT_DECK_LABEL, LEGACY_UNVERIFIED_TAG, SEED_DECK, type Card, type CardCheck } from './types';

export function deckLabel(deck: string): string {
  return deck === '' ? DEFAULT_DECK_LABEL : deck;
}

/** The deck for a card read from storage or a backup written before decks existed. */
export function migrateDeck(deck: unknown, source: string): string {
  if (typeof deck === 'string') return deck.trim();
  return source === 'seed deck' ? SEED_DECK : '';
}

/** Tags as stored from schema 3 on: the legacy unverified tag removed. */
export function migrateTags(tags: string[]): string[] {
  return tags.filter((t) => t !== LEGACY_UNVERIFIED_TAG);
}

/** A check record read from storage or a file, or null. */
export function parseCheck(v: unknown): CardCheck | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.verdict !== 'ok' && o.verdict !== 'fix' && o.verdict !== 'wrong') return null;
  return {
    verdict: o.verdict,
    note: typeof o.note === 'string' ? o.note : '',
    by: typeof o.by === 'string' ? o.by : '',
    at: typeof o.at === 'number' ? o.at : 0,
  };
}

/** Deck names in use, the default deck first, then alphabetical. */
export function deckNames(cards: Iterable<Pick<Card, 'deck' | 'deleted'>>, extra: string[] = []): string[] {
  const names = new Set<string>(extra);
  for (const c of cards) if (!c.deleted) names.add(c.deck);
  return [...names].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'ja')));
}

/** Is the card in one of the chosen decks? No choice means every deck. */
export function inDecks(card: Pick<Card, 'deck'>, decks: readonly string[]): boolean {
  return decks.length === 0 || decks.includes(card.deck);
}
