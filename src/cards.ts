import { newSrs } from './srs/fsrs';
import type { Card } from './types';
import type { CardDraft } from './data/tsv';
import { uuid } from './util';

export function createCard(draft: Partial<CardDraft> & { word: string }, now: number, id: string = uuid()): Card {
  return {
    id,
    word: draft.word.trim(),
    reading: (draft.reading ?? '').trim(),
    meaning_en: (draft.meaning_en ?? '').trim(),
    meaning_ja: (draft.meaning_ja ?? '').trim(),
    example_ja: (draft.example_ja ?? '').trim(),
    example_en: (draft.example_en ?? '').trim(),
    tags: [...new Set(draft.tags ?? [])],
    deck: (draft.deck ?? '').trim(),
    check: null,
    register: draft.register ?? null,
    source: (draft.source ?? '').trim(),
    created: now,
    updated: now,
    deleted: false,
    srs: { recognition: newSrs(now), production: newSrs(now) },
    productionUnlockedAt: null,
  };
}
