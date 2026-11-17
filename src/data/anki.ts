import type { Card } from '../types';

const COLUMNS = [
  'GUID',
  'Word',
  'Reading',
  'Meaning (EN)',
  'Meaning (JA)',
  'Example (JA)',
  'Example (EN)',
  'Register',
  'Source',
  'Tags',
];

function field(value: string): string {
  const v = value.replace(/\t/g, ' ');
  return /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Tab-separated export using Anki's file headers (Anki 2.1.55+), so
 * File → Import maps the columns, tags and note ids without manual setup.
 * Scheduling is not exported: Anki has no text format for review history.
 */
export function buildAnkiTsv(cards: Card[]): string {
  const lines = [
    '#separator:tab',
    '#html:false',
    `#columns:${COLUMNS.join('\t')}`,
    '#guid column:1',
    `#tags column:${COLUMNS.length}`,
  ];
  for (const c of [...cards].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
    if (c.deleted) continue;
    lines.push(
      [
        c.id,
        c.word,
        c.reading,
        c.meaning_en,
        c.meaning_ja,
        c.example_ja,
        c.example_en,
        c.register ?? '',
        c.source,
        // Anki tags are space-separated, so spaces inside a tag become underscores.
        c.tags.map((t) => t.replace(/\s+/g, '_')).join(' '),
      ]
        .map(field)
        .join('\t'),
    );
  }
  return lines.join('\n') + '\n';
}
