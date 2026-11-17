import { dayDiff } from '../day';
import type { Card, Settings } from '../types';
import { fileLabel } from './export';

/**
 * A cheap fingerprint of everything a backup contains. Any add, edit,
 * delete, review, undo, reset or import changes it, so "mark differs from
 * the one stored at the last backup" means "there is work not yet backed up".
 */
export function deckMark(cards: Iterable<Card>, logCount: number, lastLogAt: number): string {
  let total = 0;
  let live = 0;
  let maxUpdated = 0;
  for (const c of cards) {
    total++;
    if (!c.deleted) live++;
    if (c.updated > maxUpdated) maxUpdated = c.updated;
  }
  return `${total}.${live}.${maxUpdated}.${logCount}.${lastLogAt}`;
}

export type BackupSettings = Pick<Settings, 'autoBackup' | 'autoBackupDays' | 'lastExportAt' | 'lastBackupMark'>;

/** Should an automatic backup run now? */
export function backupDue(s: BackupSettings, mark: string, now: number): boolean {
  if (s.autoBackup === 'off') return false;
  if (mark === s.lastBackupMark) return false; // nothing new since the last backup
  if (s.autoBackup === 'folder') return true; // silent and overwrites today's file: always worth doing
  if (s.lastExportAt == null) return true;
  // Downloads pile up in the download folder, so they are rationed by study day.
  return dayDiff(s.lastExportAt, now) >= s.autoBackupDays;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches this device's automatic backup files: goi-auto_YYYY-MM-DD_<label>.json */
export function autoFilePattern(deviceLabel: string): RegExp {
  return new RegExp(`^goi-auto_\\d{4}-\\d{2}-\\d{2}_${escapeRe(fileLabel(deviceLabel))}\\.json$`);
}

/**
 * Folder mode keeps one file per day. Given the folder's file names, return
 * the ones to delete so that only the newest `keep` of this device's
 * automatic backups remain. Other files are never touched.
 */
export function filesToPrune(names: string[], deviceLabel: string, keep: number): string[] {
  const pattern = autoFilePattern(deviceLabel);
  return names
    .filter((n) => pattern.test(n))
    .sort()
    .reverse()
    .slice(Math.max(1, keep));
}

/** Any Goi backup file, manual or automatic, from any device. */
export function isBackupName(name: string): boolean {
  return /^goi-(auto|backup)_.*\.json$/.test(name);
}
