import { AUTO_TAG, REGISTERS, SEED_TAG, isInbox, isLeech, type Card } from '../types';
import { deckLabel, deckNames } from '../decks';
import { go, store, type View } from './app';
import { h, plural } from './dom';

type Special = 'all' | 'inbox' | 'leech';
const PAGE = 100;

/** Remembered between visits so returning from an edit lands on the same list. */
/** deck: '*' for every deck. */
const state: { q: string; special: Special; tag: string; register: string; deck: string } = { q: '', special: 'all', tag: '', register: '', deck: '*' };

function matches(card: Card, needle: string): boolean {
  if (!needle) return true;
  const hay = [card.word, card.reading, card.meaning_en, card.meaning_ja, card.example_ja, card.example_en, card.source]
    .join('\n')
    .toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .every((part) => hay.includes(part));
}

export function browseView(_arg: string, params: URLSearchParams): View {
  const filter = params.get('filter');
  if (filter === 'inbox' || filter === 'leech' || filter === 'all') state.special = filter;
  const deckParam = params.get('deck');
  if (deckParam !== null) state.deck = deckParam;

  const all = store.live().sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  const tags = [...new Set(all.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
  const inboxCount = all.filter(isInbox).length;
  const leechCount = all.filter(isLeech).length;
  let limit = PAGE;

  const search = h('input', { type: 'search', id: 'search', placeholder: 'Search word, reading, meaning…', value: state.q, autocomplete: 'off' });
  const tagSelect = h(
    'select',
    { id: 'filter-tag', 'aria-label': 'Tag' },
    h('option', { value: '' }, 'All tags'),
    tags.map((t) => h('option', { value: t, selected: state.tag === t, 'data-content': '' }, t)),
  );
  const registerSelect = h(
    'select',
    { id: 'filter-register', 'aria-label': 'Register' },
    h('option', { value: '' }, 'All registers'),
    REGISTERS.map((r) => h('option', { value: r, selected: state.register === r }, r)),
    h('option', { value: 'none', selected: state.register === 'none' }, '(none set)'),
  );
  const decks = deckNames(all);
  if (state.deck !== '*' && !decks.includes(state.deck)) state.deck = '*';
  const deckFilter = h(
    'select',
    { id: 'filter-deck', 'aria-label': 'Deck' },
    h('option', { value: '*' }, 'All decks'),
    decks.map((d) => h('option', { value: d, selected: state.deck === d }, deckLabel(d))),
  );
  const chips = h('div', { class: 'chips', style: 'margin:10px 0' });
  const count = h('p', { class: 'muted small', id: 'browse-count', style: 'margin:8px 0 0' });
  const list = h('div', { class: 'list', id: 'card-list' });

  const renderChips = () => {
    const chip = (key: Special, label: string) =>
      h(
        'button',
        {
          class: 'chip' + (state.special === key ? ' on' : ''),
          dataset: { filter: key },
          'aria-pressed': String(state.special === key),
          onclick: () => {
            state.special = key;
            limit = PAGE;
            renderChips();
            renderList();
          },
        },
        label,
      );
    chips.replaceChildren(chip('all', `All ${all.length}`), chip('inbox', `Inbox ${inboxCount}`), chip('leech', `Leeches ${leechCount}`));
  };

  const renderList = () => {
    const found = all.filter(
      (c) =>
        (state.special === 'all' || (state.special === 'inbox' ? isInbox(c) : isLeech(c))) &&
        (state.deck === '*' || c.deck === state.deck) &&
        (!state.tag || c.tags.includes(state.tag)) &&
        (!state.register || (state.register === 'none' ? c.register == null : c.register === state.register)) &&
        matches(c, state.q),
    );
    count.textContent = found.length === all.length ? plural(all.length, 'card') : `${found.length} of ${plural(all.length, 'card')}`;
    const rows = found.slice(0, limit).map((c) =>
      h(
        'a',
        { class: 'item', href: '#/edit/' + encodeURIComponent(c.id) },
        h(
          'div',
          { class: 'head' },
          h('span', { class: 'w', lang: 'ja', 'data-content': '' }, c.word),
          h('span', { class: 'r', lang: 'ja' }, c.reading),
          isInbox(c) ? h('span', { class: 'badge accent' }, 'inbox') : null,
          isLeech(c) ? h('span', { class: 'badge warn' }, 'leech') : null,
          c.register ? h('span', { class: 'badge' }, c.register) : null,
          decks.length > 1 && state.deck === '*' ? h('span', { class: 'badge' }, deckLabel(c.deck)) : null,
          c.tags.includes(SEED_TAG) ? h('span', { class: 'badge warn' }, 'unverified') : null,
          c.tags.includes(AUTO_TAG) ? h('span', { class: 'badge' }, 'from dictionary') : null,
        ),
        h('div', { class: 'm', 'data-content': '' }, c.meaning_en || '—'),
      ),
    );
    const inboxFirst = state.special === 'inbox' ? [...found].sort((a, b) => a.created - b.created)[0] : undefined;
    list.replaceChildren(
      inboxFirst
        ? h(
            'button',
            { class: 'block', id: 'inbox-walk', style: 'margin-bottom:10px', onclick: () => go(`edit/${encodeURIComponent(inboxFirst.id)}?next=inbox`) },
            'Fill in one at a time',
            h('span', { class: 'muted small', style: 'display:block' }, 'With the dictionary installed, each card shows what it found. Nothing is saved until you press Save.'),
          )
        : '',
      ...rows,
      ...(found.length > limit
        ? [
            h(
              'button',
              {
                class: 'block',
                style: 'margin-top:12px',
                onclick: () => {
                  limit += PAGE;
                  renderList();
                },
              },
              `Show more (${found.length - limit} hidden)`,
            ),
          ]
        : []),
      ...(found.length === 0
        ? [h('p', { class: 'muted', style: 'margin-top:16px' }, all.length === 0 ? 'No cards yet.' : 'No cards match.')]
        : []),
    );
  };

  search.addEventListener('input', () => {
    state.q = search.value.trim();
    limit = PAGE;
    renderList();
  });
  deckFilter.addEventListener('change', () => {
    state.deck = deckFilter.value;
    limit = PAGE;
    renderList();
  });
  tagSelect.addEventListener('change', () => {
    state.tag = tagSelect.value;
    limit = PAGE;
    renderList();
  });
  registerSelect.addEventListener('change', () => {
    state.register = registerSelect.value;
    limit = PAGE;
    renderList();
  });
  if (state.tag && !tags.includes(state.tag)) state.tag = '';

  renderChips();
  renderList();

  return {
    el: h('div', { class: 'page' }, h('h1', null, 'Cards'), search, chips, decks.length > 1 ? deckFilter : null, h('div', { class: 'row', style: 'margin-top:6px' }, tagSelect, registerSelect), count, list),
  };
}
