import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { autoFilePattern, backupDue, deckMark, filesToPrune, isBackupName } from '../src/data/autobackup';
import { exportFilename, parseExport, serializeExport } from '../src/data/export';
import { GoiDB } from '../src/db';
import { Store } from '../src/store';
import { DAY, T0, makeCard } from './helpers';

let counter = 0;
async function freshStore(): Promise<Store> {
  const store = new Store(new GoiDB(`auto-${++counter}`));
  await store.load(T0);
  return store;
}

describe('deck fingerprint', () => {
  it('changes on every kind of change a backup would capture', async () => {
    const store = await freshStore();
    const seen = new Set<string>([await store.mark()]);
    const expectNew = async (what: string) => {
      const m = await store.mark();
      expect(seen.has(m), what).toBe(false);
      seen.add(m);
    };
    const card = await store.addCard({ word: '稟議', reading: 'りんぎ', meaning_en: 'approval request' }, T0);
    await expectNew('add');
    await store.editCard(card.id, { meaning_en: 'circulated approval request' }, T0 + 1000);
    await expectNew('edit');
    const undo = await store.answer(card.id, 'recognition', 3, T0 + 2000);
    await expectNew('review');
    await store.undo(undo);
    // Undo returns to the pre-review fingerprint: the deck really is back where it was.
    expect(seen.has(await store.mark())).toBe(true);
    await store.answer(card.id, 'recognition', 4, T0 + 3000);
    await expectNew('review again');
    await store.resetCardProgress(card.id, T0 + 4000);
    await expectNew('reset');
    await store.deleteCard(card.id, T0 + 5000);
    await expectNew('delete');
  });

  it('is stable when nothing changed, including settings changes', async () => {
    const store = await freshStore();
    await store.addCard({ word: '齟齬', reading: 'そご' }, T0);
    const before = await store.mark();
    await store.setSettings({ maxReviewsPerDay: 10, lastExportAt: T0 });
    expect(await store.mark()).toBe(before);
  });

  it('is a plain function of its inputs', () => {
    const cards = [makeCard({ updated: 5 }), makeCard({ updated: 9, deleted: true })];
    expect(deckMark(cards, 3, 77)).toBe('2.1.9.3.77');
    expect(deckMark([], 0, 0)).toBe('0.0.0.0.0');
  });
});

describe('when an automatic backup is due', () => {
  const base = { autoBackup: 'download' as const, autoBackupDays: 1, lastExportAt: T0, lastBackupMark: 'a' };

  it('never when turned off', () => {
    expect(backupDue({ ...base, autoBackup: 'off', lastExportAt: null }, 'b', T0)).toBe(false);
  });

  it('never when nothing changed since the last backup', () => {
    expect(backupDue(base, 'a', T0 + 30 * DAY)).toBe(false);
    expect(backupDue({ ...base, autoBackup: 'folder' }, 'a', T0 + 30 * DAY)).toBe(false);
  });

  it('immediately for a deck that has never been backed up', () => {
    expect(backupDue({ ...base, lastExportAt: null, lastBackupMark: '' }, 'b', T0)).toBe(true);
  });

  it('folder mode: as soon as anything changes', () => {
    expect(backupDue({ ...base, autoBackup: 'folder' }, 'b', T0 + 1000)).toBe(true);
  });

  it('download mode: at most once per study day', () => {
    expect(backupDue(base, 'b', T0 + 3 * 3600_000)).toBe(false); // later the same day
    expect(backupDue(base, 'b', T0 + DAY)).toBe(true); // next day
  });

  it('download mode: honours a longer interval', () => {
    const weekly = { ...base, autoBackupDays: 7 };
    expect(backupDue(weekly, 'b', T0 + 6 * DAY)).toBe(false);
    expect(backupDue(weekly, 'b', T0 + 7 * DAY)).toBe(true);
  });

  it('a manual export counts: it resets the clock and the fingerprint', async () => {
    const store = await freshStore();
    await store.addCard({ word: '査収', reading: 'さしゅう' }, T0);
    expect(backupDue(store.settings, await store.mark(), T0)).toBe(true);
    await store.export(T0);
    expect(backupDue(store.settings, await store.mark(), T0 + 5 * DAY)).toBe(false);
    await store.addCard({ word: '拝受', reading: 'はいじゅ' }, T0 + 5 * DAY);
    expect(backupDue(store.settings, await store.mark(), T0 + 5 * DAY)).toBe(true);
  });
});

describe('backup bookkeeping', () => {
  it('records nothing until the write is committed', async () => {
    const store = await freshStore();
    await store.addCard({ word: '失念', reading: 'しつねん' }, T0);
    const { file, commit } = await store.prepareBackup('folder “Backups”', T0);
    // The file describes itself as backed up...
    expect(file.settings.lastExportAt).toBe(T0);
    expect(parseExport(serializeExport(file)).cards).toHaveLength(1);
    // ...but if the write failed here, the app would still know it has no backup.
    expect(store.settings.lastExportAt).toBeNull();
    expect(backupDue(store.settings, await store.mark(), T0)).toBe(true);
    await commit();
    expect(store.settings).toMatchObject({ lastExportAt: T0, lastBackupWhere: 'folder “Backups”' });
    expect(backupDue(store.settings, await store.mark(), T0 + DAY)).toBe(false);
  });

  it('restoring a file leaves nothing to back up, and keeps this device’s backup setup', async () => {
    const source = await freshStore();
    await source.setSettings({ autoBackup: 'off', autoBackupDays: 7 });
    await source.addCard({ word: '幸甚', reading: 'こうじん' }, T0);
    const text = serializeExport(await source.export(T0));

    const target = await freshStore();
    await target.setSettings({ autoBackup: 'folder', autoBackupKeep: 30 });
    await target.replaceWith(parseExport(text), T0 + DAY);
    expect(target.settings).toMatchObject({ autoBackup: 'folder', autoBackupKeep: 30, autoBackupDays: 1, lastExportAt: T0 });
    expect(backupDue(target.settings, await target.mark(), T0 + DAY)).toBe(false);
  });

  it('merging in new data makes a backup due again', async () => {
    const source = await freshStore();
    await source.addCard({ word: '平素', reading: 'へいそ' }, T0);
    const file = parseExport(serializeExport(await source.export(T0)));
    const target = await freshStore();
    await target.addCard({ word: '賜る', reading: 'たまわる' }, T0);
    await target.export(T0);
    expect(backupDue({ ...target.settings, autoBackup: 'folder' }, await target.mark(), T0)).toBe(false);
    await target.applyMerge(await target.planImport(file), T0);
    expect(backupDue({ ...target.settings, autoBackup: 'folder' }, await target.mark(), T0)).toBe(true);
  });
});

describe('folder rotation', () => {
  const day = (d: number, label = 'desktop') => `goi-auto_2026-11-${String(d).padStart(2, '0')}_${label}.json`;

  it('names automatic files by day and device', () => {
    expect(exportFilename('auto', 'desktop', T0)).toBe('goi-auto_2026-11-17_desktop.json');
    expect(autoFilePattern('desktop').test(exportFilename('auto', 'desktop', T0))).toBe(true);
    expect(autoFilePattern('My PC (home)').test(exportFilename('auto', 'My PC (home)', T0))).toBe(true);
  });

  it('keeps the newest N daily files and removes the rest', () => {
    const names = [day(3), day(1), day(5), day(2), day(4)];
    expect(filesToPrune(names, 'desktop', 3)).toEqual([day(2), day(1)]);
    expect(filesToPrune(names, 'desktop', 14)).toEqual([]);
  });

  it('never touches manual exports, other devices’ files or unrelated files', () => {
    const names = [
      day(1), day(2), day(3),
      day(1, 's24'), day(2, 's24'),
      'goi-backup_2026-11-01_desktop.json',
      'goi-auto_2026-11-01_desktop.json.bak',
      'notes.txt',
      'goi-auto_2026-11-01_desktop-old.json',
    ];
    expect(filesToPrune(names, 'desktop', 1)).toEqual([day(2), day(1)]);
  });

  it('always keeps at least one file', () => {
    expect(filesToPrune([day(1), day(2)], 'desktop', 0)).toEqual([day(1)]);
  });

  it('recognises Goi backup files of either kind', () => {
    expect(isBackupName('goi-auto_2026-11-17_s24.json')).toBe(true);
    expect(isBackupName('goi-backup_2026-11-17_s24.json')).toBe(true);
    expect(isBackupName('goi-anki_2026-11-17_s24.tsv')).toBe(false);
    expect(isBackupName('holiday.json')).toBe(false);
  });
});
