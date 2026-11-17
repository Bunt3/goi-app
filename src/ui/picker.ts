import { SEED_TAG, isInbox, type Card } from '../types';
import { lookup, segment, sentenceAround, type Token } from '../textpick';
import type { DictMatch } from '../dict/lookup';
import { ensurePersistence, store } from './app';
import { AutoFill, candidateList, dictLookup, dictStatus } from './dict';
import { h, toast } from './dom';

export interface PickerOptions {
  /** The text to pick from: one example sentence, or several captured lines. */
  text: string;
  /** Tags given to cards added from here. */
  tags?: string[];
  /** Deck for cards added from here ('' is the default deck). */
  deck?: string | (() => string);
  /** Source note given to cards added from here. */
  source?: string | (() => string);
  /** Translation to carry over, used only when the new card's example is the whole text. */
  exampleEn?: string;
  /** A deck word to leave unselectable-looking (the card the sentence belongs to). */
  ownWord?: string;
  onAdded?: (card: Card) => void;
}

/**
 * Tappable text plus a result panel: tap a word, tap another to extend the
 * selection, see whether it is already in the deck, add it if not.
 */
export function pickerPanel(opts: PickerOptions): HTMLElement {
  const text = opts.text;
  let mode: 'word' | 'char' = 'word';
  let tokens: Token[] = [];
  let from = -1;
  let to = -1;
  let lookupToken = 0;

  const flow = h('div', { class: 'pick-text', lang: 'ja' });
  const result = h('div', { class: 'pick-result', 'aria-live': 'polite' });
  const modeBtn = h('button', { class: 'link small', type: 'button', onclick: toggleMode });

  function toggleMode(): void {
    mode = mode === 'word' ? 'char' : 'word';
    from = to = -1;
    render();
  }

  function selectionText(): string {
    return from < 0 ? '' : text.slice(tokens[from]!.start, tokens[to]!.end);
  }

  function tap(i: number): void {
    if (from < 0) from = to = i;
    else if (i === from && i === to) from = to = -1; // tap the only selected piece again: clear
    else if (i >= from && i <= to) from = to = i; // tap inside a range: narrow to that piece
    else {
      // Extend to the tapped piece, but never across a line break.
      const a = Math.min(from, i);
      const b = Math.max(to, i);
      if (text.slice(tokens[a]!.start, tokens[b]!.end).includes('\n')) from = to = i;
      else {
        from = a;
        to = b;
      }
    }
    render();
  }

  function render(): void {
    tokens = segment(text, mode);
    const deckWords = new Set(store.live().map((c) => c.word));
    flow.replaceChildren(
      ...tokens.map((t, i) => {
        if (t.text.includes('\n')) return h('br');
        if (!t.word) return h('span', { class: 'tok-gap' }, t.text);
        const on = i >= from && i <= to;
        const known = deckWords.has(t.text) && t.text !== opts.ownWord;
        return h(
          'button',
          {
            type: 'button',
            class: 'tok' + (on ? ' on' : '') + (known ? ' known' : ''),
            'aria-pressed': String(on),
            dataset: { i: String(i) },
            onclick: () => tap(i),
          },
          t.text,
        );
      }),
    );
    modeBtn.textContent = mode === 'word' ? 'Wrong split? Pick by character' : 'Pick by word';
    renderResult();
  }

  function cardLine(card: Card, label: string): HTMLElement {
    return h(
      'a',
      { class: 'pick-card', href: '#/edit/' + encodeURIComponent(card.id) },
      h('span', { class: 'badge accent' }, label),
      h('b', { lang: 'ja' }, card.word),
      h('span', { class: 'muted', lang: 'ja' }, card.reading),
      card.meaning_en ? h('span', { class: 'muted small', 'data-content': '' }, card.meaning_en) : h('span', { class: 'muted small' }, isInbox(card) ? 'in the Inbox, no meaning yet' : ''),
    );
  }

  function renderResult(): void {
    const sel = selectionText();
    if (!sel) {
      result.replaceChildren(h('p', { class: 'muted small' }, 'Tap a word. Tap another to stretch the selection across a phrase.'));
      return;
    }
    const found = lookup(store.live(), sel);
    if (found.exact.length > 0) {
      result.replaceChildren(
        h('p', { id: 'pick-status' }, h('b', { lang: 'ja' }, sel), ' is already in your deck.'),
        ...found.exact.map((c) => cardLine(c, 'in deck')),
      );
      return;
    }

    const word = h('input', { type: 'text', id: 'pick-word', lang: 'ja', value: sel, autocomplete: 'off', autocapitalize: 'off' });
    const reading = h('input', { type: 'text', id: 'pick-reading', lang: 'ja', placeholder: 'reading (kana)', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'next' });
    const meaning = h('input', { type: 'text', id: 'pick-meaning', placeholder: 'meaning (English)', autocomplete: 'off', enterkeyhint: 'done' });
    const add = h('button', { class: 'primary block', id: 'pick-add', type: 'button' });
    const label = () => {
      add.textContent = reading.value.trim() && meaning.value.trim() ? 'Add to deck' : 'Add to Inbox';
    };
    reading.addEventListener('input', label);
    meaning.addEventListener('input', label);
    label();

    // Dictionary: fill the word's dictionary form, reading and meaning. The
    // example stays the sentence it was picked from.
    const fill = new AutoFill({ word, reading, meaning_en: meaning });
    fill.markAuto(word, sel);
    const dictBox = h('div', { id: 'pick-dict' });
    const token = ++lookupToken;
    let matches: DictMatch[] = [];
    const showMatches = () => {
      const inDeck = fill.chosen ? store.live().find((c) => c.word === fill.chosen!.term) : undefined;
      dictBox.replaceChildren(
        candidateList(matches, fill.chosen, (m) => {
          fill.apply(m, { word: true });
          label();
          showMatches();
        }),
        inDeck ? h('div', null, h('p', { class: 'small', style: 'margin:6px 0 2px' }, h('b', { lang: 'ja' }, inDeck.word), ' is already in your deck.'), cardLine(inDeck, 'in deck')) : '',
      );
    };
    void dictLookup(sel).then((found) => {
      if (token !== lookupToken) return;
      matches = found;
      if (found.length > 0) {
        fill.apply(found[0]!, { word: true });
        label();
        showMatches();
      } else if (dictStatus().state === 'installed') {
        dictBox.replaceChildren(h('p', { class: 'muted small' }, 'Not found in the dictionary.'));
      } else if (dictStatus().state === 'available') {
        dictBox.replaceChildren(
          h('p', { class: 'muted small' }, h('a', { href: '#/more?focus=dict' }, 'Download the dictionary'), ' to fill in readings and meanings.'),
        );
      }
    });

    const start = tokens[from]!.start;
    const end = tokens[to]!.end;
    add.addEventListener('click', async () => {
      const w = word.value.trim();
      if (!w) return;
      const dup = store.live().find((c) => c.word === w && (c.reading === reading.value.trim() || !reading.value.trim()));
      if (dup) {
        toast(`${w} is already in your deck.`);
        renderResult();
        return;
      }
      const example = sentenceAround(text, start, end);
      const card = await store.addCard({
        word: w,
        reading: reading.value.trim(),
        meaning_en: meaning.value.trim(),
        example_ja: example,
        // A translation only carries over if the example is the very sentence it translated.
        example_en: example === text.trim() ? (opts.exampleEn ?? '') : '',
        tags: [...new Set([...(opts.tags ?? []).filter((t) => t !== SEED_TAG), ...fill.extras().tags])],
        register: fill.extras().register,
        deck: typeof opts.deck === 'function' ? opts.deck() : (opts.deck ?? ''),
        source: typeof opts.source === 'function' ? opts.source() : (opts.source ?? ''),
      });
      void ensurePersistence();
      toast(isInbox(card) ? `Added ${card.word} to the Inbox.` : `Added ${card.word}.`);
      opts.onAdded?.(card);
      // Re-render: if the word was added as selected it now shows as "in your deck".
      // If it was edited to a dictionary form first, show that card instead.
      const shown = lookup(store.live(), selectionText()).exact.length > 0;
      render();
      if (!shown) result.replaceChildren(h('p', { id: 'pick-status' }, 'Added.'), cardLine(card, 'new'));
    });
    for (const input of [word, reading, meaning]) {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (input === word) reading.focus();
        else if (input === reading) meaning.focus();
        else add.click();
      });
    }

    result.replaceChildren(
      h('p', { id: 'pick-status' }, h('b', { lang: 'ja' }, sel), ' is not in your deck.'),
      ...found.related.slice(0, 3).map((c) => cardLine(c, 'related')),
      dictBox,
      h(
        'div',
        { class: 'stack', style: 'margin-top:8px' },
        h('label', { class: 'field', style: 'margin:0' }, h('span', null, 'Word (edit to the dictionary form if you like)'), word),
        reading,
        meaning,
        add,
        h('p', { class: 'muted small', style: 'margin:0' }, 'Only the word is needed. Without a reading and meaning it waits in the Inbox.'),
      ),
    );
  }

  render();
  return h('div', { class: 'picker' }, flow, h('div', { style: 'text-align:right' }, modeBtn), result);
}

// ---- Bottom sheet, for picking from a card's example mid-review ----------

let sheet: HTMLElement | null = null;

export function pickerOpen(): boolean {
  return sheet !== null;
}

export function closePicker(): void {
  sheet?.remove();
  sheet = null;
  document.removeEventListener('keydown', onSheetKey, true);
}

function onSheetKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closePicker();
  }
}

export function openPickerSheet(opts: PickerOptions): void {
  closePicker();
  sheet = h(
    'div',
    {
      class: 'sheet-backdrop',
      onclick: (e: Event) => {
        if (e.target === sheet) closePicker();
      },
    },
    h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-label': 'Pick a word from the sentence' },
      h(
        'div',
        { class: 'row spread', style: 'margin-bottom:8px' },
        h('b', null, 'Pick a word'),
        h('button', { class: 'icon', id: 'pick-close', 'aria-label': 'Close', onclick: closePicker }, '✕'),
      ),
      pickerPanel(opts),
    ),
  );
  document.body.append(sheet);
  document.addEventListener('keydown', onSheetKey, true);
}
