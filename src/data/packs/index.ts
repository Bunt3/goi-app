/** Starter decks: built-in sets of cards, each loaded into its own deck. */
import { createCard } from '../../cards';
import { SEED_DECK, SEED_TAG, type Card } from '../../types';
import type { PackEntry } from './common';

export interface PackInfo {
  id: string;
  /** Deck the cards go into. */
  deck: string;
  title: string;
  blurb: string;
  /** Card ids are uuidFromName(`${idPrefix}:${word}:${reading}`): stable across devices, so loading twice merges. */
  idPrefix: string;
  load: () => Promise<PackEntry[]>;
}

export const PACKS: PackInfo[] = [
  {
    id: 'workplace',
    deck: SEED_DECK,
    title: 'Workplace',
    blurb: 'About 180 workplace words and set phrases: phone, email, meetings, HR and contracts, customer and IT support.',
    // The original seed deck. Its id prefix and source must never change (see CLAUDE.md).
    idPrefix: 'seed',
    load: async () => (await import('../seed')).SEED.map((e) => ({ ...e, source: '' })),
  },
  {
    id: 'slang',
    deck: 'Modern slang',
    title: 'Modern slang',
    blurb:
      'About 90 casual, youth and internet words, most found in published rankings 2016–2026 (三省堂 今年の新語, 新語・流行語大賞, teen surveys). Grouped by feelings, abbreviations, 推し活, social media, people, patterns, and a few now-dated words to recognise.',
    idPrefix: 'pack:slang',
    load: async () => (await import('./slang')).SLANG,
  },
  {
    id: 'office',
    deck: 'Office slang',
    title: 'Office slang & jargon',
    blurb:
      'About 85 things office workers say that textbooks skip: なるはや, リスケ, アサイン, 握る, 温度感, chat and remote-work terms, recent buzzwords, and a few older managers’ phrases.',
    idPrefix: 'pack:office',
    load: async () => (await import('./office')).OFFICE,
  },
  {
    id: 'onomatopoeia',
    deck: '擬音語・擬態語',
    title: 'Onomatopoeia by situation',
    blurb: 'About 125 擬音語・擬態語 grouped by where you meet them: weather, food, body and health, feelings, how people act, work, home, sounds, movement.',
    idPrefix: 'pack:onoma',
    load: async () => (await import('./onomatopoeia')).ONOMATOPOEIA,
  },
];

/**
 * The cards a pack would add. Skips any card already here (including one
 * deleted on purpose) and any word the owner already has with the same reading.
 */
export async function packCards(
  pack: PackInfo,
  entries: PackEntry[],
  existing: Map<string, Card>,
  idFor: (name: string) => Promise<string>,
  now: number,
): Promise<{ fresh: Card[]; skipped: number }> {
  const have = new Set<string>();
  for (const c of existing.values()) if (!c.deleted) have.add(`${c.word}|${c.reading}`);
  const fresh: Card[] = [];
  let skipped = 0;
  for (const [i, e] of entries.entries()) {
    const id = await idFor(`${pack.idPrefix}:${e.word}:${e.reading}`);
    if (existing.has(id) || have.has(`${e.word}|${e.reading}`)) {
      skipped++;
      continue;
    }
    have.add(`${e.word}|${e.reading}`);
    const source = pack.id === 'workplace' ? 'seed deck' : `${pack.title} starter deck${e.source ? ` · documented: ${e.source}` : ''}`;
    fresh.push(createCard({ ...e, tags: [...e.tags, SEED_TAG], source, deck: pack.deck }, now + i, id));
  }
  return { fresh, skipped };
}
