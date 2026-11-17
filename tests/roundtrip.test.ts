import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAnkiTsv } from '../src/data/anki';
import { ImportError, exportFilename, parseExport, serializeExport } from '../src/data/export';
import { isNoop } from '../src/data/merge';
import { parseDelimited } from '../src/data/tsv';
import { GoiDB } from '../src/db';
import { Store } from '../src/store';
import { DAY, T0 } from './helpers';

let counter = 0;
async function freshStore(): Promise<Store> {
  const store = new Store(new GoiDB(`test-${++counter}`));
  await store.load(T0);
  return store;
}

async function populated(): Promise<Store> {
  const store = await freshStore();
  await store.setSettings({ deviceLabel: 'S24 Ultra', maxReviewsPerDay: 25, furigana: false, ttsRate: 0.8 });
  const a = await store.addCard(
    {
      word: '承る',
      reading: 'うけたまわる',
      meaning_en: 'to receive (an order/request) — humble',
      meaning_ja: '「受ける」「聞く」の謙譲語',
      example_ja: 'ご注文を承りました。',
      example_en: 'We have received your order.',
      tags: ['電話応対', '接客'],
      register: '謙譲語',
      source: 'call centre script, "p. 3"',
    },
    T0 - 3 * DAY,
  );
  const b = await store.addCard({ word: '齟齬', reading: 'そご', meaning_en: 'discrepancy', tags: ['会議'] }, T0 - 2 * DAY);
  await store.addCard({ word: '按分', reading: '' }, T0 - DAY); // inbox
  const gone = await store.addCard({ word: '削除', reading: 'さくじょ', meaning_en: 'deletion' }, T0 - DAY);
  await store.deleteCard(gone.id, T0);
  await store.answer(a.id, 'recognition', 3, T0 - 3 * DAY + 1000, 3100);
  await store.answer(a.id, 'recognition', 3, T0 - 3 * DAY + 700_000, 2500);
  await store.answer(a.id, 'production', 4, T0 - DAY, 5000);
  await store.answer(b.id, 'recognition', 1, T0 - 60_000, 8000);
  return store;
}

describe('export → import round trip', () => {
  let source: Store;
  beforeEach(async () => {
    source = await populated();
  });

  it('"replace everything" on an empty device restores identical data', async () => {
    const text = serializeExport(await source.export(T0));
    const target = await freshStore();
    await target.replaceWith(parseExport(text), T0);

    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId([...target.cards.values()])).toEqual(byId([...source.cards.values()]));
    expect(byId(await target.allLogs())).toEqual(byId(await source.allLogs()));
    // Everything is restored except the note of where the last backup went.
    expect(target.settings).toEqual({ ...source.settings, lastBackupWhere: 'the imported file' });
    expect(target.settings.lastExportAt).toBe(T0);
    expect(target.todayLogs).toHaveLength(1);
  });

  it('merge into an empty device restores cards, logs and progress (settings stay local)', async () => {
    const text = serializeExport(await source.export(T0));
    const target = await freshStore();
    const plan = await target.planImport(parseExport(text));
    expect(plan.summary).toMatchObject({ cardsAdded: 3, logsAdded: 4, logsDuplicate: 0 });
    await target.applyMerge(plan, T0);

    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId([...target.cards.values()])).toEqual(byId([...source.cards.values()]));
    expect(byId(await target.allLogs())).toEqual(byId(await source.allLogs()));
    expect(target.settings.deviceLabel).toBe('');
    expect(target.settings.maxReviewsPerDay).toBe(40);
  });

  it('re-importing your own export is a no-op', async () => {
    const text = serializeExport(await source.export(T0));
    const snapshot = () => JSON.stringify([...source.cards.values()].sort((x, y) => x.id.localeCompare(y.id)));
    const before = snapshot();
    const plan = await source.planImport(parseExport(text));
    expect(isNoop(plan.summary)).toBe(true);
    await source.applyMerge(plan, T0);
    expect(snapshot()).toBe(before);
    expect(await source.allLogs()).toHaveLength(4);
  });

  it('survives a second generation: export → import → export is byte-identical', async () => {
    const first = serializeExport(await source.export(T0));
    const target = await freshStore();
    await target.replaceWith(parseExport(first), T0);
    const second = serializeExport(await target.export(T0));
    expect(second).toBe(first);
  });

  it('writes a versioned file with a dated, device-labelled name', async () => {
    const file = await source.export(T0);
    expect(file.app).toBe('goi-app');
    expect(file.schemaVersion).toBe(1);
    expect(file.deviceLabel).toBe('S24 Ultra');
    expect(exportFilename('backup', file.deviceLabel, T0)).toBe('goi-backup_2026-11-17_S24-Ultra.json');
    expect(exportFilename('anki', '', T0)).toBe('goi-anki_2026-11-17_device.tsv');
    expect(exportFilename('backup', 'a/b:c*?', T0)).toBe('goi-backup_2026-11-17_a-b-c.json');
  });

  it('rejects files that are not usable backups, with a reason', () => {
    expect(() => parseExport('not json')).toThrow(ImportError);
    expect(() => parseExport('{"cards":[]}')).toThrow(/not a Goi backup/);
    expect(() => parseExport(JSON.stringify({ app: 'goi-app', schemaVersion: 99, cards: [], reviewLogs: [] }))).toThrow(
      /schema version 99/,
    );
    expect(() => parseExport(JSON.stringify({ app: 'goi-app', schemaVersion: 1, cards: [{}], reviewLogs: [] }))).toThrow(
      /no id/,
    );
  });

  it('fills in defaults for fields a hand-edited file leaves out', () => {
    const file = parseExport(
      JSON.stringify({ app: 'goi-app', schemaVersion: 1, cards: [{ id: 'x', word: '進捗' }], reviewLogs: [] }),
    );
    expect(file.cards[0]).toMatchObject({ id: 'x', word: '進捗', reading: '', tags: [], register: null, deleted: false });
    expect(file.cards[0]!.srs.recognition.state).toBe(0);
    expect(file.settings.maxReviewsPerDay).toBe(40);
  });
});

describe('Anki TSV export', () => {
  it('produces a headered file that parses back to the same fields', async () => {
    const source = await populated();
    await source.addCard({ word: '引用', reading: 'いんよう', meaning_en: 'he said "quote"\nsecond line\twith tab' }, T0);
    const tsv = buildAnkiTsv([...source.cards.values()]);
    const lines = tsv.split('\n');
    expect(lines.slice(0, 5)).toEqual([
      '#separator:tab',
      '#html:false',
      '#columns:GUID\tWord\tReading\tMeaning (EN)\tMeaning (JA)\tExample (JA)\tExample (EN)\tRegister\tSource\tTags',
      '#guid column:1',
      '#tags column:10',
    ]);
    const rows = parseDelimited(lines.slice(5).join('\n'), '\t');
    expect(rows).toHaveLength(4); // deleted card excluded, inbox card included
    expect(rows.every((r) => r.length === 10)).toBe(true);
    const uketamawaru = rows.find((r) => r[1] === '承る')!;
    expect(uketamawaru.slice(2)).toEqual([
      'うけたまわる',
      'to receive (an order/request) — humble',
      '「受ける」「聞く」の謙譲語',
      'ご注文を承りました。',
      'We have received your order.',
      '謙譲語',
      'call centre script, "p. 3"',
      '電話応対 接客',
    ]);
    expect(rows.find((r) => r[1] === '引用')![3]).toBe('he said "quote"\nsecond line with tab');
  });
});
