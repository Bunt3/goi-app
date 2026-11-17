import { exampleNode, wordNode } from '../furigana';
import { SEED_TAG, isLeech, type Card } from '../types';
import { speakOrExplain } from './actions';
import { h } from './dom';
import { openPickerSheet } from './picker';

const wordClass = (word: string) => ([...word].length > 7 ? 'word long' : 'word');

/** Recognition prompt: the word (no furigana — the reading is the answer) in its sentence. */
export function recognitionFront(card: Card): HTMLElement[] {
  const example = card.example_ja ? exampleNode(card.example_ja, card.word, card.reading, 'highlight', false) : null;
  const parts: (HTMLElement | null)[] = [
    h('div', { class: 'prompt-kind' }, 'Reading and meaning?'),
    h('div', { class: wordClass(card.word), lang: 'ja' }, card.word),
    example ? h('div', { class: 'example', lang: 'ja' }, example) : null,
  ];
  return parts.filter((x): x is HTMLElement => x !== null);
}

/** Production prompt: English and context, with the target word blanked out of the sentence. */
export function productionFront(card: Card): HTMLElement[] {
  const blanked = card.example_ja ? exampleNode(card.example_ja, card.word, card.reading, 'blank', false) : null;
  const parts: (HTMLElement | null)[] = [
    h('div', { class: 'prompt-kind' }, 'Say it in Japanese'),
    h('div', { class: 'prompt-en' }, card.meaning_en),
    card.register ? h('div', { class: 'meta-line' }, h('span', { class: 'badge accent' }, card.register)) : null,
    blanked ? h('div', { class: 'example', lang: 'ja' }, blanked) : null,
    blanked && card.example_en ? h('div', { class: 'example-en' }, card.example_en) : null,
  ];
  return parts.filter((x): x is HTMLElement => x !== null);
}

/** The full answer, shared by both directions and by listening mode. */
export function cardBack(card: Card, furigana: boolean, opts: { audio?: boolean; divider?: boolean } = {}): HTMLElement {
  const { audio = true, divider = false } = opts;
  const example = card.example_ja ? exampleNode(card.example_ja, card.word, card.reading, 'highlight', furigana) : null;
  return h(
    'div',
    { class: divider ? 'answer divided' : 'answer' },
    // Furigana goes on the word inside the example sentence. Only when there is
    // no sentence does it go on the headword (the reading line follows either way).
    h('div', { class: wordClass(card.word), lang: 'ja' }, example ? card.word : wordNode(card.word, card.reading, furigana)),
    h('div', { class: 'reading', lang: 'ja' }, card.reading),
    h('div', { class: 'meaning' }, card.meaning_en),
    card.meaning_ja ? h('div', { class: 'meaning-ja', lang: 'ja' }, card.meaning_ja) : null,
    example ? h('div', { class: 'example', lang: 'ja' }, example) : null,
    card.example_en ? h('div', { class: 'example-en' }, card.example_en) : null,
    h(
      'div',
      { class: 'meta-line' },
      card.register ? h('span', { class: 'badge accent' }, card.register) : null,
      card.tags.map((t) => h('span', { class: t === SEED_TAG ? 'badge warn' : 'badge' }, t)),
      isLeech(card) ? h('span', { class: 'badge warn' }, 'leech — consider rewriting') : null,
      card.source ? h('span', { class: 'badge' }, card.source) : null,
    ),
    h(
      'div',
      { class: 'meta-line' },
      audio ? h('button', { class: 'chip', onclick: () => void speakOrExplain(card.word) }, '🔊 Word') : null,
      audio && card.example_ja ? h('button', { class: 'chip', onclick: () => void speakOrExplain(card.example_ja) }, '🔊 Sentence') : null,
      card.example_ja
        ? h(
            'button',
            {
              class: 'chip',
              id: 'pick-open',
              onclick: () =>
                openPickerSheet({
                  text: card.example_ja,
                  exampleEn: card.example_en,
                  tags: card.tags,
                  source: `example sentence for ${card.word}`,
                  ownWord: card.word,
                }),
            },
            '＋ Word from sentence',
          )
        : null,
      h('a', { class: 'chip', href: '#/edit/' + encodeURIComponent(card.id), style: 'display:inline-flex;align-items:center;text-decoration:none;border:1px solid var(--line)' }, '✎ Edit'),
    ),
  );
}
