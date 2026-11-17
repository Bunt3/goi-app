/** The Dictionary screen: search, browse by label, read an entry, add it to a deck. */
import { deckLabel } from '../decks';
import type { DictEntry, DictSense } from '../dict/entry';
import { BROWSE_LABELS, browseOrder, cardFields, labelsFor, matchForEntry, type DictMatch } from '../dict/lookup';
import { findByEnglish, findByLabel, findByPrefix } from '../dictdb';
import { AUTO_TAG } from '../types';
import { ensurePersistence, store, type View } from './app';
import { deckSelect } from './deckselect';
import { dictDatabase, dictLookup, dictReady, dictStatus } from './dict';
import { h, plural, toast } from './dom';

const JAPANESE = /[぀-ヿ㐀-鿿々〆ー]/;
const PAGE = 50;
/** Remembered between visits. */
const state: { q: string; label: string; deck: string } = { q: '', label: '', deck: '' };

function senseView(s: DictSense): HTMLElement {
  const tags = [...(s.p ?? []), ...(s.m ?? []), ...(s.f ?? []), ...(s.d ?? [])];
  return h(
    'li',
    null,
    h('span', null, s.g.join('; ')),
    tags.length ? h('span', { class: 'muted small' }, '  ', tags.join(', ')) : null,
    s.n?.length ? h('div', { class: 'muted small' }, s.n.join(' ')) : null,
  );
}

export async function dictView(_arg: string, params: URLSearchParams): Promise<View> {
  const q0 = params.get('q');
  if (q0 !== null) state.q = q0;
  const page = h('div', { class: 'page' }, h('h1', null, 'Dictionary'));
  if (!(await dictReady())) {
    const s = dictStatus();
    page.append(
      h('p', null, s.state === 'unavailable' ? s.reason : 'The dictionary is not on this device yet.'),
      h('a', { href: '#/more?focus=dict', class: 'chip linkchip' }, 'Download it in More'),
    );
    return { el: page };
  }
  const db = dictDatabase();
  const installed = dictStatus().state === 'installed' ? (dictStatus() as { info: { format: number } }).info : null;
  const canBrowse = (installed?.format ?? 1) >= 2;

  const search = h('input', {
    type: 'search',
    id: 'dict-q',
    lang: 'ja',
    placeholder: 'Japanese (any form) or English',
    value: state.q,
    autocomplete: 'off',
    autocapitalize: 'off',
  });
  const labels = h('div', { class: 'chips', id: 'dict-labels', style: 'margin:10px 0' });
  const status = h('p', { class: 'muted small', id: 'dict-count', style: 'margin:4px 0' });
  const list = h('div', { class: 'list', id: 'dict-results' });
  let token = 0;
  let open: number | null = null;

  function inDeck(m: DictMatch) {
    return store.live().find((c) => c.word === m.term || (m.entry.k.includes(c.word) && m.entry.r.includes(c.reading)));
  }

  function detail(m: DictMatch): HTMLElement {
    const exampleList = m.entry.s.flatMap((s) => s.x ?? []);
    let chosenExample = 0;
    const deck = deckSelect(state.deck, 'dict-deck');
    const f = cardFields(m);
    const existing = inDeck(m);
    const add = h('button', { class: 'primary block', id: 'dict-add' }, 'Add to deck');
    add.addEventListener('click', async () => {
      const ex = exampleList[chosenExample];
      const d = deck.value();
      state.deck = d;
      await store.addCard({
        word: f.word,
        reading: f.reading,
        meaning_en: f.meaning_en,
        example_ja: ex?.[0] ?? '',
        example_en: ex?.[1] ?? '',
        tags: [...new Set([...f.tags, AUTO_TAG])],
        register: f.register,
        source: 'dictionary',
        deck: d,
      });
      void ensurePersistence();
      toast(`Added ${f.word} to ${deckLabel(d)}.`);
      render();
    });
    return h(
      'div',
      { class: 'dict-detail', id: 'dict-detail' },
      m.entry.k.length > 1 || m.entry.r.length > 1
        ? h('p', { class: 'small', lang: 'ja' }, 'Also written: ', [...m.entry.k, ...m.entry.r].filter((x) => x !== f.word).join('、'))
        : null,
      h('ol', { class: 'senses small' }, m.entry.s.map(senseView)),
      exampleList.length
        ? h(
            'div',
            { class: 'small' },
            h('b', null, 'Example sentences'),
            h('span', { class: 'muted' }, ' (from the Tanaka Corpus; quality varies). The chosen one goes on the card.'),
            exampleList.map(([ja, en], i) =>
              h(
                'label',
                { class: 'check dict-ex' },
                h('input', {
                  type: 'radio',
                  name: 'dict-ex',
                  checked: i === 0,
                  onchange: () => {
                    chosenExample = i;
                  },
                }),
                h('span', null, h('span', { lang: 'ja' }, ja), h('br'), h('span', { class: 'muted' }, en)),
              ),
            ),
            h(
              'label',
              { class: 'check dict-ex' },
              h('input', {
                type: 'radio',
                name: 'dict-ex',
                onchange: () => {
                  chosenExample = -1;
                },
              }),
              h('span', { class: 'muted' }, 'No example'),
            ),
          )
        : h('p', { class: 'muted small' }, 'No example sentence in the dictionary for this word.'),
      existing
        ? h(
            'p',
            { class: 'small' },
            'Already in ',
            h('b', null, deckLabel(existing.deck)),
            ': ',
            h('a', { href: '#/edit/' + encodeURIComponent(existing.id) }, 'open the card'),
          )
        : h('div', { class: 'stack', style: 'margin-top:8px' }, h('span', { class: 'muted small' }, 'Deck'), deck.el, add),
    );
  }

  let shown: DictMatch[] = [];
  let limit = PAGE;

  function render(): void {
    list.replaceChildren(
      ...shown.slice(0, limit).map((m) => {
        const f = cardFields(m);
        const isOpen = open === m.entry.i;
        const owned = inDeck(m);
        return h(
          'div',
          { class: 'item dict-item' + (isOpen ? ' open' : ''), dataset: { entry: String(m.entry.i) } },
          h(
            'button',
            {
              type: 'button',
              class: 'dict-row',
              'aria-expanded': String(isOpen),
              onclick: () => {
                open = isOpen ? null : m.entry.i;
                render();
              },
            },
            h(
              'span',
              { class: 'dict-head' },
              h('b', { lang: 'ja' }, f.word),
              f.reading !== f.word ? h('span', { class: 'muted', lang: 'ja' }, f.reading) : null,
              owned ? h('span', { class: 'badge accent' }, 'in deck') : null,
              ...labelsFor(m).map((l) => h('span', { class: 'badge' }, l)),
            ),
            h('span', { class: 'small dict-gloss' }, f.meaning_en),
            m.reasons.length ? h('span', { class: 'muted small' }, m.reasons.join(' · ')) : null,
          ),
          isOpen ? detail(m) : null,
        );
      }),
      shown.length > limit
        ? h(
            'button',
            {
              class: 'block',
              style: 'margin-top:12px',
              onclick: () => {
                limit += PAGE;
                render();
              },
            },
            `Show more (${shown.length - limit} hidden)`,
          )
        : '',
    );
  }

  function show(matches: DictMatch[], what: string): void {
    shown = matches;
    limit = PAGE;
    open = matches.length === 1 ? matches[0]!.entry.i : null;
    status.textContent = matches.length ? `${plural(matches.length, 'entry', 'entries')} ${what}.` : `Nothing found ${what}.`;
    render();
  }

  async function runSearch(): Promise<void> {
    const q = search.value.trim();
    state.q = q;
    const t = ++token;
    renderLabels();
    if (!q) {
      if (state.label) await runLabel(state.label);
      else {
        shown = [];
        status.textContent = canBrowse ? 'Search, or pick a label to browse.' : 'Search for a word.';
        render();
      }
      return;
    }
    status.textContent = 'Searching…';
    let matches: DictMatch[];
    if (JAPANESE.test(q)) {
      const exact = await dictLookup(q);
      const seen = new Set(exact.map((m) => m.entry.i));
      const prefix = (await findByPrefix(db, q)).filter((e) => !seen.has(e.i)).sort(browseOrder).map(matchForEntry);
      matches = [...exact, ...prefix];
    } else {
      matches = (await findByEnglish(db, q)).sort(browseOrder).map(matchForEntry);
    }
    if (t !== token) return;
    show(matches, `for “${q}”`);
  }

  async function runLabel(code: string): Promise<void> {
    const t = ++token;
    status.textContent = 'Loading…';
    const entries: DictEntry[] = await findByLabel(db, code);
    if (t !== token) return;
    const title = BROWSE_LABELS.find((l) => l.code === code)?.title ?? code;
    show(entries.sort(browseOrder).map(matchForEntry), `labelled ${title}, common words first`);
  }

  function renderLabels(): void {
    if (!canBrowse) {
      labels.replaceChildren(h('p', { class: 'muted small', style: 'margin:0' }, 'To browse by label (slang, onomatopoeia, business…), download the dictionary again in More.'));
      return;
    }
    labels.replaceChildren(
      ...BROWSE_LABELS.map((l) =>
        h(
          'button',
          {
            class: 'chip' + (state.label === l.code && !state.q ? ' on' : ''),
            'aria-pressed': String(state.label === l.code && !state.q),
            dataset: { label: l.code },
            onclick: () => {
              state.label = state.label === l.code && !search.value.trim() ? '' : l.code;
              search.value = '';
              void runSearch();
            },
          },
          l.title,
        ),
      ),
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void runSearch(), 250);
  });
  void runSearch();

  page.append(
    search,
    labels,
    status,
    list,
    h('p', { class: 'muted small', style: 'margin-top:16px' }, 'JMdict, by the Electronic Dictionary Research and Development Group. Attribution in More → Dictionary.'),
  );
  return { el: page, destroy: () => clearTimeout(timer) };
}
