/**
 * Checker mode (#/check): a native speaker goes through cards one at a time
 * and marks each natural, needing a fix, or wrong, with a note. Verdicts are
 * stored on the card (Card.check) and shown only here and, for fixes, on the
 * card's edit screen.
 */
import { cardsToCheck, checkCounts, type CheckFilter } from '../check';
import { deckLabel, deckNames } from '../decks';
import type { Card, CheckVerdict } from '../types';
import { refresh, store, type View } from './app';
import { h, plural, toast } from './dom';
import { setUiLang, uiLang } from './i18n';

/** Kept for the session so a checker can stop and carry on. */
const session: { decks: string[]; by: string; filter: CheckFilter } = { decks: [], by: '', filter: 'unchecked' };

function field(label: string, value: string, ja = false): HTMLElement | null {
  if (!value) return null;
  return h('div', { class: 'check-field' }, h('span', { class: 'muted small' }, label), h('div', { lang: ja ? 'ja' : null, 'data-content': '' }, value));
}

export function checkerView(arg: string): View {
  return arg === 'go' ? runView() : startView();
}

function startView(): View {
  const live = store.live();
  const decks = deckNames(live);
  const counts = checkCounts(live, session.decks);
  const chips = h('div', { class: 'chips', id: 'check-decks' });
  const renderChips = () =>
    chips.replaceChildren(
      ...decks.map((d) => {
        const on = session.decks.includes(d);
        return h(
          'button',
          {
            class: 'chip' + (on ? ' on' : ''),
            'aria-pressed': String(on),
            dataset: { deck: d },
            onclick: () => {
              session.decks = on ? session.decks.filter((x) => x !== d) : [...session.decks, d];
              refresh();
            },
          },
          `${deckLabel(d)} · ${checkCounts(live, [d]).unchecked}`,
        );
      }),
    );
  renderChips();
  const name = h('input', { type: 'text', id: 'check-by', value: session.by, autocomplete: 'off', placeholder: 'e.g. 佐藤' });
  name.addEventListener('change', () => (session.by = name.value.trim()));
  const flagged = cardsToCheck(live, session.decks, 'flagged');

  const start = (filter: CheckFilter) => {
    session.by = name.value.trim();
    session.filter = filter;
    location.hash = '#/check/go';
  };

  return {
    el: h(
      'div',
      { class: 'page' },
      h('h1', null, 'Checker mode'),
      h(
        'div',
        { class: 'row', style: 'margin-bottom:12px' },
        h(
          'button',
          {
            id: 'check-lang',
            onclick: async () => {
              const next = uiLang() === 'ja' ? 'en' : 'ja';
              await store.setSettings({ uiLang: next });
              setUiLang(next);
              refresh();
            },
          },
          uiLang() === 'ja' ? 'Show in English' : '日本語で表示',
        ),
      ),
      h(
        'p',
        null,
        'Thank you for helping. You will see one flashcard at a time. Please mark whether the Japanese sounds natural. If something is off, write how you would say it. Your notes go only to the owner of this app.',
      ),
      h('p', { class: 'muted small' }, 'Choose decks to check (none = all):'),
      chips,
      h('label', { class: 'field', style: 'margin-top:10px' }, h('span', null, 'Your name (optional)'), name),
      h(
        'dl',
        { class: 'kv small', id: 'check-counts' },
        h('dt', null, 'Not checked yet'),
        h('dd', null, counts.unchecked),
        h('dt', null, 'Natural'),
        h('dd', null, counts.ok),
        h('dt', null, 'Needs a fix'),
        h('dd', null, counts.fix),
        h('dt', null, 'Wrong'),
        h('dd', null, counts.wrong),
      ),
      h(
        'div',
        { class: 'stack', style: 'margin-top:12px' },
        h('button', { class: 'primary big', id: 'check-start', disabled: counts.unchecked === 0, onclick: () => start('unchecked') }, counts.unchecked ? 'Start checking' : 'Everything here is checked'),
      ),
      flagged.length
        ? h(
            'section',
            { id: 'check-results' },
            h('h2', null, 'Notes from checkers'),
            h('p', { class: 'muted small' }, 'Edit the card, then clear the note so it can be checked again.'),
            ...flagged.map((c) => resultRow(c)),
          )
        : null,
    ),
  };
}

function resultRow(c: Card): HTMLElement {
  const check = c.check!;
  return h(
    'div',
    { class: 'card check-result', dataset: { id: c.id }, style: 'margin-bottom:8px' },
    h(
      'div',
      { class: 'row spread' },
      h('b', { lang: 'ja', 'data-content': '' }, c.word),
      h('span', { class: check.verdict === 'wrong' ? 'badge warn' : 'badge accent' }, check.verdict === 'wrong' ? 'Wrong' : 'Needs a fix'),
    ),
    check.note ? h('p', { lang: 'ja', 'data-content': '', style: 'margin:6px 0' }, check.note) : null,
    check.by ? h('p', { class: 'muted small', 'data-content': '', style: 'margin:0' }, check.by) : null,
    h(
      'div',
      { class: 'row', style: 'margin-top:6px' },
      h('a', { href: '#/edit/' + encodeURIComponent(c.id), class: 'chip linkchip' }, 'Edit card'),
      h(
        'button',
        {
          class: 'link small',
          onclick: async () => {
            await store.setCheck(c.id, null);
            toast('Note cleared.');
            refresh();
          },
        },
        'Clear note',
      ),
    ),
  );
}

function runView(): View {
  const queue = cardsToCheck(store.live(), session.decks, 'unchecked');
  const total = queue.length;
  let i = 0;
  let done = 0;
  const body = h('div', { id: 'check-card' });
  const progress = h('p', { class: 'muted small', id: 'check-progress' });

  function show(): void {
    const card = queue[i];
    progress.textContent = `${done} checked · ${total - done} to go`;
    if (!card) {
      body.replaceChildren(
        h('p', { id: 'check-done' }, 'All done. Thank you!'),
        h('a', { href: '#/check', class: 'chip linkchip' }, 'Back to checker mode'),
      );
      return;
    }
    const note = h('textarea', { id: 'check-note', rows: 3, lang: 'ja', placeholder: 'How would you say it? What is wrong?' });
    const noteBox = h('div', { style: 'display:none' });
    let pending: CheckVerdict | null = null;
    const record = async (verdict: CheckVerdict) => {
      await store.setCheck(card.id, { verdict, note: note.value.trim(), by: session.by, at: Date.now() });
      done++;
      i++;
      show();
    };
    const ask = (verdict: CheckVerdict) => {
      pending = verdict;
      noteBox.style.display = '';
      note.focus();
    };
    noteBox.append(
      h('label', { class: 'field' }, h('span', null, 'Your note'), note),
      h('button', { class: 'primary block', id: 'check-save', onclick: () => pending && void record(pending) }, 'Save note and continue'),
    );
    body.replaceChildren(
      h(
        'div',
        { class: 'card check-sheet' },
        h('div', { class: 'muted small', 'data-content': '' }, deckLabel(card.deck)),
        h('div', { class: 'check-word', lang: 'ja', 'data-content': '' }, card.word),
        field('Reading', card.reading, true),
        field('Meaning (English)', card.meaning_en),
        field('Meaning (Japanese)', card.meaning_ja, true),
        field('Example', card.example_ja, true),
        field('Example (English)', card.example_en),
        card.register ? field('Register', card.register) : null,
      ),
      h(
        'div',
        { class: 'check-actions' },
        h('button', { class: 'primary', id: 'check-ok', onclick: () => void record('ok') }, '✓ Natural'),
        h('button', { id: 'check-fix', onclick: () => ask('fix') }, '✎ Needs a fix'),
        h('button', { class: 'danger', id: 'check-wrong', onclick: () => ask('wrong') }, '✗ Wrong'),
        h(
          'button',
          {
            class: 'link',
            id: 'check-skip',
            onclick: () => {
              i++;
              show();
            },
          },
          'Skip',
        ),
      ),
      noteBox,
    );
  }
  show();

  return {
    el: h(
      'div',
      { class: 'page' },
      h('div', { class: 'row spread' }, h('h1', { style: 'margin:0' }, 'Checker mode'), h('a', { href: '#/check', class: 'small' }, 'Stop')),
      progress,
      body,
      h('p', { class: 'muted small', style: 'margin-top:16px' }, `${plural(total, 'card')} in this round. You can stop at any time; checked cards are saved.`),
    ),
  };
}
