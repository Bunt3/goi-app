import { backupDue } from '../data/autobackup';
import { exportFilename, serializeExport } from '../data/export';
import { folderAccess, folderSupported, savedFolder, writeBackup } from '../backupfs';
import { store } from './app';
import { download, toast } from './dom';

/**
 * When a backup may run:
 * - 'session': a study session just ended. A tap is still "active", so a
 *   download may start and a folder permission prompt may be shown.
 * - 'silent':  no user gesture (data changed, or the app was opened). Only a
 *   folder write that already has permission is allowed; never a download.
 * - 'manual':  the user pressed "Back up now". Always runs.
 */
export type BackupTrigger = 'session' | 'silent' | 'manual';

export type BackupOutcome =
  | { status: 'skipped' }
  | { status: 'saved'; where: string }
  | { status: 'needs-permission' }
  | { status: 'failed'; reason: string };

let running: Promise<BackupOutcome> | null = null;

export function runAutoBackup(trigger: BackupTrigger): Promise<BackupOutcome> {
  // One at a time: a silent write and a session-end write must not interleave on the same file.
  if (running) return trigger === 'silent' ? Promise.resolve({ status: 'skipped' }) : running.then(() => runAutoBackup(trigger));
  running = backup(trigger).finally(() => {
    running = null;
  });
  return running;
}

async function backup(trigger: BackupTrigger): Promise<BackupOutcome> {
  const s = store.settings;
  const now = Date.now();
  // Never write a backup of nothing: after site data is wiped the deck is
  // empty, and an empty file must not take the place of a good one.
  if (store.cards.size === 0) return { status: 'skipped' };
  if (trigger !== 'manual') {
    if (s.autoBackup === 'off') return { status: 'skipped' };
    if (!backupDue(s, await store.mark(), now)) return { status: 'skipped' };
  }

  if (s.autoBackup === 'folder' && folderSupported()) {
    const folder = await savedFolder();
    if (folder) {
      const access = await folderAccess(folder, trigger !== 'silent');
      if (access !== 'granted') {
        if (trigger !== 'silent') toast('The backup folder needs permission again. Nothing was saved.', undefined, 6000);
        return { status: 'needs-permission' };
      }
      const where = `folder “${folder.name}”`;
      try {
        const { file, commit } = await store.prepareBackup(where, now);
        await writeBackup(folder, exportFilename('auto', s.deviceLabel, now), serializeExport(file), s.deviceLabel, s.autoBackupKeep);
        await commit();
        if (trigger !== 'silent') toast(`Backed up to ${where}.`);
        return { status: 'saved', where };
      } catch (err) {
        const reason = (err as Error)?.message ?? String(err);
        if (trigger === 'silent') return { status: 'failed', reason };
        // The folder may have been moved, renamed or unmounted. Don't leave the session unprotected.
        toast(`Couldn’t write to the backup folder (${reason}). Saving to Downloads instead.`, undefined, 8000);
      }
    } else if (trigger === 'silent') {
      return { status: 'needs-permission' };
    }
  }

  if (trigger === 'silent') return { status: 'skipped' };
  const { file, commit } = await store.prepareBackup('Downloads', now);
  try {
    await download(exportFilename('auto', s.deviceLabel, now), serializeExport(file), 'application/json');
  } catch (err) {
    // Only the APK can tell; the backup is still due and runs again next time.
    const reason = (err as Error)?.message ?? String(err);
    toast(
      trigger === 'manual' ? `The backup was not saved (${reason}). Try again.` : `The backup was not saved (${reason}). It will be tried again after your next session.`,
      undefined,
      8000,
    );
    return { status: 'failed', reason };
  }
  await commit();
  toast('Backup saved to Downloads.');
  return { status: 'saved', where: 'Downloads' };
}

/** Is there unsaved work that a folder backup can't save without the user's help? */
export async function folderNeedsAttention(): Promise<'ok' | 'no-folder' | 'needs-permission'> {
  if (store.settings.autoBackup !== 'folder' || !folderSupported()) return 'ok';
  const folder = await savedFolder();
  if (!folder) return 'no-folder';
  return (await folderAccess(folder, false)) === 'granted' ? 'ok' : 'needs-permission';
}

// ---- Silent backups after changes (folder mode) --------------------------

const QUIET_MS = 20_000;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Called on every change to the deck. Coalesces bursts (a review session) into one write. */
export function noteChange(): void {
  if (store.settings.autoBackup !== 'folder') return;
  clearTimeout(timer);
  timer = setTimeout(() => void runAutoBackup('silent'), QUIET_MS);
}

export function installBackupHooks(): void {
  store.onChange = noteChange;
  // Leaving the app (switching away, locking the phone): write now rather than wait out the timer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    clearTimeout(timer);
    void runAutoBackup('silent');
  });
}
