import type { CardDraft } from '../data/tsv';
import { toHiragana } from '../furigana';
import { formatInterval } from '../srs/fsrs';
import { DEFAULT_TAGS, DIRECTIONS, REGISTERS, SEED_TAG, SrsPhase, isInbox, isLeech, type Card, type Register } from '../types';
import { ensurePersistence, go, store, type View } from './app';
import { AutoFill, candidateList, dictLookup, dictStatus } from './dict';
import { deckSelect } from './deckselect';
import { h, toast } from './dom';

/** Source and tags usually repeat while adding several words from one place, so they stick for the session. */
const sticky: { source: string; tags: string[]; deck: string } = { source: '', tags: [], deck: '' };

const KANA_ONLY = /^[぀-ヿー]+$/;

interface FormHandle {
  el: HTMLElement;
  read: () => CardDraft;
  word: HTMLInputElement;
  reading: HTMLInputElement;
  reset: () => void;
}

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'field' }, h('span', null, label), control);
}

/**
 * dict: 'add' looks the word up as it is typed and fills the reading, meaning
 * and example when the word is found as typed; 'edit' does the same once for
 * the card's word. Fields the owner typed are never overwritten.
 */
function cardForm(initial: Partial<CardDraft>, opts: { detailsOpen: boolean; dict?: 'add' | 'edit' }): FormHandle {
  const word = h('input', {
    type: 'text',
    class: 'jp-big',
    id: 'f-word',
    lang: 'ja',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterkeyhint: 'next',
    value: initial.word ?? '',
  });
  const reading = h('input', {
    type: 'text',
    id: 'f-reading',
    lang: 'ja',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterkeyhint: 'done',
    value: initial.reading ?? '',
  });
  const meaningEn = h('input', { type: 'text', id: 'f-meaning-en', autocomplete: 'off', value: initial.meaning_en ?? '' });
  const meaningJa = h('input', { type: 'text', id: 'f-meaning-ja', lang: 'ja', autocomplete: 'off', value: initial.meaning_ja ?? '' });
  const exampleJa = h('textarea', { id: 'f-example-ja', lang: 'ja', rows: 2, value: initial.example_ja ?? '' });
  const exampleEn = h('textarea', { id: 'f-example-en', rows: 2, value: initial.example_en ?? '' });
  const source = h('input', { type: 'text', id: 'f-source', autocomplete: 'off', value: initial.source ?? '' });
  const deck = deckSelect(initial.deck ?? '', 'f-deck');
  const register = h(
    'select',
    { id: 'f-register' },
    h('option', { value: '' }, '—'),
    REGISTERS.map((r) => h('option', { value: r, selected: initial.register === r }, r)),
  );

  // --- Reading autofill from the IME -------------------------------------
  // While the word is being composed, the IME reports the kana before it is
  // converted to kanji. Capture that as the reading. Best effort: it is
  // only applied while the reading field hasn't been typed in by hand.
  let readingTouched = (initial.reading ?? '') !== '';
  let autoReading = '';
  let pendingKana = '';
  reading.addEventListener('input', () => {
    readingTouched = reading.value !== '';
    if (!readingTouched) autoReading = '';
  });
  word.addEventListener('compositionupdate', (e) => {
    const data = (e as CompositionEvent).data ?? '';
    if (KANA_ONLY.test(data)) pendingKana = data;
  });
  word.addEventListener('compositionend', () => {
    if (pendingKana && !readingTouched) {
      autoReading += toHiragana(pendingKana);
      reading.value = autoReading;
      fill.markAuto(reading, autoReading);
    }
    pendingKana = '';
  });
  word.addEventListener('input', () => {
    if (word.value === '' && !readingTouched) {
      autoReading = '';
      reading.value = '';
    }
  });

  // --- Dictionary ----------------------------------------------------------
  const fill = new AutoFill({ word, reading, meaning_en: meaningEn, example_ja: exampleJa, example_en: exampleEn });
  const dictBox = h('div', { id: 'f-dict' });
  let lookupToken = 0;
  let lookupTimer: ReturnType<typeof setTimeout> | undefined;
  let looked = '';
  async function lookUp(): Promise<void> {
    const text = word.value.trim();
    if (text === looked) return;
    looked = text;
    const token = ++lookupToken;
    if (fill.chosen && fill.chosen.term !== text) fill.undo();
    if (!text) {
      dictBox.replaceChildren();
      return;
    }
    const found = await dictLookup(text);
    if (token !== lookupToken) return;
    const show = () =>
      dictBox.replaceChildren(
        found.length
          ? candidateList(found, fill.chosen, (m) => {
              fill.apply(m, { word: true });
              looked = word.value.trim();
              show();
            })
          : dictStatus().state === 'installed'
            ? h('p', { class: 'muted small', style: 'margin-top:-8px' }, 'Not found in the dictionary.')
            : '',
      );
    // Fill straight away only when the word was found as typed; a conjugated
    // form or another spelling waits for a tap.
    const best = found[0];
    if (best && best.reasons.length === 0 && best.term === text) fill.apply(best, { word: false });
    show();
  }
  if (opts.dict) {
    word.addEventListener('input', () => {
      clearTimeout(lookupTimer);
      lookupTimer = setTimeout(() => void lookUp(), 300);
    });
    word.addEventListener('blur', () => void lookUp());
    if (opts.dict === 'edit' && (initial.word ?? '') !== '') void lookUp();
  }

  // --- Tags --------------------------------------------------------------
  const selected = new Set(initial.tags ?? []);
  const tagBox = h('div', { class: 'chips', id: 'f-tags', 'data-content': '' });
  const customTag = h('input', { type: 'text', placeholder: 'custom tag', autocomplete: 'off', style: 'flex:1' });
  const renderTags = () => {
    const known = [...new Set<string>([...DEFAULT_TAGS, ...store.live().flatMap((c) => c.tags), ...selected])].filter(
      (t) => t !== SEED_TAG || selected.has(t),
    );
    tagBox.replaceChildren(
      ...known.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip' + (selected.has(t) ? ' on' : ''),
            'aria-pressed': selected.has(t) ? 'true' : 'false',
            onclick: () => {
              if (selected.has(t)) selected.delete(t);
              else selected.add(t);
              renderTags();
            },
          },
          t,
        ),
      ),
    );
  };
  const addCustom = () => {
    const t = customTag.value.trim();
    if (!t) return;
    selected.add(t);
    customTag.value = '';
    renderTags();
  };
  customTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addCustom();
    }
  });
  renderTags();

  const details = h(
    'details',
    { open: opts.detailsOpen, id: 'f-details' },
    h('summary', null, 'Meaning, example, tags'),
    field('Meaning (English)', meaningEn),
    field('Meaning (Japanese, optional)', meaningJa),
    field('Example sentence', exampleJa),
    field('Example translation (optional)', exampleEn),
    h('div', { class: 'field' }, h('span', { class: 'muted small', style: 'display:block;margin-bottom:4px' }, 'Tags'), tagBox),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, customTag, h('button', { type: 'button', onclick: addCustom }, 'Add tag')),
    field('Register', register),
    field('Source (where you saw it)', source),
  );

  const el = h('div', null, field('Word', word), dictBox, field('Reading (kana)', reading), h('div', { class: 'field' }, h('span', { class: 'muted small', style: 'display:block;margin-bottom:4px' }, 'Deck'), deck.el), details);

  return {
    el,
    word,
    reading,
    read: () => {
      addCustom();
      // Dictionary values still in the form bring their tags (auto-filled, slang, …) and register.
      const extra = fill.extras();
      return {
        word: word.value.trim(),
        reading: reading.value.trim(),
        meaning_en: meaningEn.value.trim(),
        meaning_ja: meaningJa.value.trim(),
        example_ja: exampleJa.value.trim(),
        example_en: exampleEn.value.trim(),
        tags: [...new Set([...selected, ...extra.tags])],
        register: ((register.value || null) as Register | null) ?? extra.register,
        source: source.value.trim(),
        deck: deck.value(),
      };
    },
    reset: () => {
      for (const input of [word, reading, meaningEn, meaningJa, exampleJa, exampleEn]) input.value = '';
      register.value = '';
      readingTouched = false;
      autoReading = '';
      pendingKana = '';
      fill.reset();
      clearTimeout(lookupTimer);
      lookupToken++;
      looked = '';
      dictBox.replaceChildren();
    },
  };
}

export function addView(): View {
  const form = cardForm({ source: sticky.source, tags: sticky.tags, deck: sticky.deck }, { detailsOpen: false, dict: 'add' });
  const message = h('div', { id: 'add-message', class: 'small', style: 'min-height:22px;margin-bottom:6px' });
  let added = 0;

  async function save(): Promise<void> {
    const draft = form.read();
    message.replaceChildren();
    if (!draft.word || !draft.reading) {
      message.append(h('span', { style: 'color:var(--warn)' }, 'Word and reading are both needed.'));
      (draft.word ? form.reading : form.word).focus();
      return;
    }
    const existing = store.live().find((c) => c.word === draft.word && c.reading === draft.reading);
    if (existing) {
      message.append(
        h('span', { style: 'color:var(--warn)' }, 'Already in your deck. '),
        h('a', { href: '#/edit/' + encodeURIComponent(existing.id) }, 'Open it'),
      );
      return;
    }
    const card = await store.addCard(draft);
    void ensurePersistence();
    sticky.source = draft.source;
    sticky.tags = draft.tags;
    sticky.deck = draft.deck ?? '';
    added++;
    form.reset();
    form.word.focus();
    toast(isInbox(card) ? `Saved ${card.word} to the Inbox — add a meaning when you have a minute.` : `Saved ${card.word}.`, {
      label: 'Edit',
      run: () => go('edit/' + encodeURIComponent(card.id)),
    });
    counter.textContent = `${added} added this session`;
  }

  form.word.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      form.reading.focus();
    }
  });
  form.reading.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void save();
    }
  });

  const counter = h('span', { class: 'muted small' });
  const el = h(
    'div',
    { class: 'page' },
    h('h1', null, 'Add a word'),
    h(
      'div',
      { class: 'chips', style: 'margin-bottom:14px' },
      h('a', { href: '#/capture', class: 'chip linkchip', id: 'to-capture' }, '📷 From a photo, screenshot or text'),
      h('a', { href: '#/dict', class: 'chip linkchip', id: 'to-dict' }, '📖 Dictionary'),
      h('a', { href: '#/bulk', class: 'chip linkchip' }, 'Paste a list'),
    ),
    form.el,
    h(
      'div',
      { class: 'sticky-bottom' },
      message,
      h('button', { class: 'primary big', id: 'save-card', onclick: () => void save() }, 'Save'),
      h('div', { class: 'row spread', style: 'margin-top:6px' }, h('span', { class: 'muted small' }, 'Only word + reading are required. The rest can wait in the Inbox.'), counter),
    ),
  );
  setTimeout(() => form.word.focus(), 50);
  return { el };
}

function scheduleSummary(card: Card): HTMLElement {
  const now = Date.now();
  const phase = ['new', 'learning', 'review', 'relearning'];
  return h(
    'dl',
    { class: 'kv small' },
    DIRECTIONS.flatMap((d) => {
      const st = card.srs[d];
      let text: string;
      if (d === 'production' && card.productionUnlockedAt == null) text = 'locked until recognition succeeds';
      else if (st.state === SrsPhase.New) text = 'new';
      else {
        const diff = st.due - now;
        text = `${phase[st.state]} · ${diff <= 0 ? 'due' : 'due in ' + formatInterval(diff)} · ${st.reps} reviews · ${st.lapses} lapses`;
      }
      return [h('dt', null, d), h('dd', { style: 'font-weight:400' }, text)];
    }),
  );
}

/** The next Inbox card after this one, for working through the Inbox one card at a time. */
function nextInbox(afterId: string): Card | undefined {
  const inbox = store.live().filter(isInbox).sort((a, b) => a.created - b.created);
  return inbox.find((c) => c.id !== afterId);
}

export function editView(arg: string, params?: URLSearchParams): View {
  const card = store.cards.get(arg);
  if (!card || card.deleted) {
    return { el: h('div', { class: 'page' }, h('h1', null, 'Card not found'), h('a', { href: '#/browse' }, 'Back to cards')) };
  }
  // Working through the Inbox: after saving, go straight to the next card.
  const walking = params?.get('next') === 'inbox';
  const form = cardForm(card, { detailsOpen: true, dict: isInbox(card) ? 'edit' : undefined });
  const message = h('div', { class: 'small', style: 'min-height:22px;margin-bottom:6px;color:var(--warn)' });
  const confirmBox = h('div');

  async function save(): Promise<void> {
    const draft = form.read();
    if (!draft.word) {
      message.textContent = 'The word can’t be empty.';
      return;
    }
    await store.editCard(card!.id, draft);
    if (walking) {
      const next = nextInbox(card!.id);
      toast(next ? 'Saved. Next Inbox card.' : 'Saved. The Inbox is empty.');
      go(next ? `edit/${encodeURIComponent(next.id)}?next=inbox` : 'browse?filter=inbox');
      return;
    }
    toast('Saved.');
    history.length > 1 ? history.back() : go('browse');
  }

  function askDelete(): void {
    confirmBox.replaceChildren(
      h(
        'div',
        { class: 'notice danger' },
        h('p', null, `Delete ${card!.word}? Its review history stays in backups, but the card is removed from study.`),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'danger solid',
              id: 'confirm-delete',
              onclick: async () => {
                await store.deleteCard(card!.id);
                toast(`Deleted ${card!.word}.`);
                go('browse');
              },
            },
            'Delete',
          ),
          h('button', { onclick: () => confirmBox.replaceChildren() }, 'Cancel'),
        ),
      ),
    );
  }

  function askReset(): void {
    confirmBox.replaceChildren(
      h(
        'div',
        { class: 'notice' },
        h('p', null, 'Reset scheduling for both directions? The card starts again as new. Use this after rewriting a card that never stuck.'),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              id: 'confirm-reset',
              onclick: async () => {
                await store.resetCardProgress(card!.id);
                toast('Progress reset.');
                go('edit/' + encodeURIComponent(card!.id));
              },
            },
            'Reset progress',
          ),
          h('button', { onclick: () => confirmBox.replaceChildren() }, 'Cancel'),
        ),
      ),
    );
  }

  const el = h(
    'div',
    { class: 'page' },
    h('h1', null, 'Edit card'),
    isLeech(card)
      ? h('div', { class: 'notice' }, 'This card has lapsed 8 or more times. A clearer meaning or a different example sentence usually helps more than further repetition.')
      : null,
    card.tags.includes(SEED_TAG)
      ? h('div', { class: 'notice info small' }, 'From the seed deck and not yet verified. Remove the seed-unverified tag once you’ve checked it against a source you trust.')
      : null,
    form.el,
    h('h2', null, 'Scheduling'),
    scheduleSummary(card),
    h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { onclick: askReset }, 'Reset progress…'), h('button', { class: 'danger', id: 'delete-card', onclick: askDelete }, 'Delete…')),
    confirmBox,
    h(
      'div',
      { class: 'sticky-bottom' },
      message,
      walking
        ? h(
            'div',
            { class: 'row' },
            h('button', { class: 'primary big grow', id: 'save-card', onclick: () => void save() }, 'Save, next'),
            h(
              'button',
              {
                id: 'skip-card',
                onclick: () => {
                  const next = nextInbox(card!.id);
                  go(next && next.id !== card!.id ? `edit/${encodeURIComponent(next.id)}?next=inbox` : 'browse?filter=inbox');
                },
              },
              'Skip',
            ),
          )
        : h('button', { class: 'primary big', id: 'save-card', onclick: () => void save() }, 'Save changes'),
    ),
  );
  return { el };
}
