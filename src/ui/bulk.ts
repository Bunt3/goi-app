import { createCard } from '../cards';
import {
  IMPORT_FIELDS,
  detectDelimiter,
  guessMapping,
  looksLikeHeader,
  parseDelimited,
  rowsToDrafts,
  splitTags,
  type ColumnMapping,
  type ImportField,
} from '../data/tsv';
import { isInbox } from '../types';
import { ensurePersistence, go, store, type View } from './app';
import { h, plural, toast } from './dom';

const FIELD_LABEL: Record<ImportField, string> = {
  word: 'Word',
  reading: 'Reading',
  meaning_en: 'Meaning (EN)',
  meaning_ja: 'Meaning (JA)',
  example_ja: 'Example (JA)',
  example_en: 'Example (EN)',
  tags: 'Tags',
  register: 'Register',
  source: 'Source',
};

export function bulkView(): View {
  const text = h('textarea', {
    id: 'bulk-text',
    rows: 8,
    lang: 'ja',
    spellcheck: false,
    placeholder: 'Paste rows from a spreadsheet (tab-separated) or CSV.\n\n稟議\tりんぎ\tapproval by circulation\t稟議を上げる。',
  });
  const stage = h('div', { id: 'bulk-stage' });
  let rows: string[][] = [];
  let mapping: ColumnMapping = [];
  let hasHeader = false;
  let extraTags = '';

  function parse(): void {
    rows = parseDelimited(text.value);
    if (rows.length === 0) {
      stage.replaceChildren(h('p', { class: 'muted' }, 'Nothing to import yet.'));
      return;
    }
    hasHeader = looksLikeHeader(rows);
    mapping = guessMapping(rows, hasHeader);
    renderMapping();
  }

  function renderMapping(): void {
    const width = mapping.length;
    const result = rowsToDrafts(rows, mapping, hasHeader, store.live(), splitTags(extraTags));
    const inbox = result.drafts.filter(isInbox).length;
    const hasWord = mapping.includes('word');
    const delimiter = detectDelimiter(text.value) === '\t' ? 'tab' : 'comma';

    const headerRow = h(
      'tr',
      null,
      Array.from({ length: width }, (_, col) =>
        h(
          'th',
          null,
          h(
            'select',
            {
              'aria-label': `Column ${col + 1}`,
              dataset: { col: String(col) },
              onchange: (e: Event) => {
                const value = (e.target as HTMLSelectElement).value as ImportField | '';
                // A field can only come from one column: taking it here releases it elsewhere.
                if (value) mapping = mapping.map((m) => (m === value ? null : m));
                mapping[col] = value || null;
                renderMapping();
              },
            },
            h('option', { value: '' }, '(ignore)'),
            IMPORT_FIELDS.map((f) => h('option', { value: f, selected: mapping[col] === f }, FIELD_LABEL[f])),
          ),
        ),
      ),
    );
    const sample = rows.slice(0, 6).map((r, i) =>
      h(
        'tr',
        { style: hasHeader && i === 0 ? 'opacity:.5' : '' },
        Array.from({ length: width }, (_, col) => h('td', { lang: 'ja', title: r[col] ?? '' }, r[col] ?? '')),
      ),
    );

    stage.replaceChildren(
      h('h2', null, 'Match the columns'),
      h('p', { class: 'muted small' }, `${plural(rows.length, 'row')} found, ${delimiter}-separated. Check the guess for each column.`),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, headerRow), h('tbody', null, sample))),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          id: 'bulk-header',
          checked: hasHeader,
          onchange: (e: Event) => {
            hasHeader = (e.target as HTMLInputElement).checked;
            renderMapping();
          },
        }),
        'First row is a header (skip it)',
      ),
      h(
        'label',
        { class: 'field' },
        h('span', null, 'Add these tags to every card (optional)'),
        h('input', {
          type: 'text',
          value: extraTags,
          placeholder: 'e.g. メール',
          onchange: (e: Event) => {
            extraTags = (e.target as HTMLInputElement).value;
            renderMapping();
          },
        }),
      ),
      h(
        'div',
        { class: 'card small', id: 'bulk-summary' },
        hasWord
          ? [
              h('div', null, h('b', null, plural(result.drafts.length, 'card')), ' will be added.'),
              inbox > 0 ? h('div', { class: 'muted' }, `${inbox} of them go to the Inbox (no reading or meaning).`) : null,
              result.skippedDuplicate > 0 ? h('div', { class: 'muted' }, `${plural(result.skippedDuplicate, 'duplicate')} skipped (same word and reading).`) : null,
              result.skippedEmpty > 0 ? h('div', { class: 'muted' }, `${plural(result.skippedEmpty, 'row')} skipped (no word).`) : null,
            ]
          : h('div', { style: 'color:var(--warn)' }, 'Choose which column holds the word.'),
      ),
      h(
        'button',
        {
          class: 'primary big',
          id: 'bulk-import',
          disabled: !hasWord || result.drafts.length === 0,
          onclick: async () => {
            const now = Date.now();
            // Offset timestamps by a millisecond each so the pasted order is the study order.
            await store.addCards(result.drafts.map((d, i) => createCard(d, now + i)));
            void ensurePersistence();
            toast(`Added ${plural(result.drafts.length, 'card')}.`);
            go(inbox > 0 ? 'browse?filter=inbox' : 'browse?filter=all');
          },
        },
        `Add ${plural(result.drafts.length, 'card')}`,
      ),
    );
  }

  const el = h(
    'div',
    { class: 'page' },
    h('h1', null, 'Paste many'),
    h('p', { class: 'muted small' }, 'One card per line. Columns can be in any order; you match them up in the next step.'),
    text,
    h('button', { class: 'block', id: 'bulk-parse', style: 'margin:10px 0 4px', onclick: parse }, 'Preview'),
    stage,
  );
  return { el };
}
