/**
 * Writing backups into a real folder with the File System Access API.
 *
 * Only Chromium browsers have the folder picker (Chrome and Edge on desktop,
 * Chrome on Android). Firefox does not implement it and Brave disables it,
 * so everything here is feature-detected and the caller falls back to
 * ordinary downloads.
 *
 * In the APK the folder comes from Android's folder picker instead
 * (native.ts gives it the same shape), so the rest is shared.
 */
import { filesToPrune, isBackupName } from './data/autobackup';
import { db } from './db';
import { forgetNativeFolder, nativeFolderHandle, nativeFolderInfo, pickNativeFolder } from './native';

type Access = 'granted' | 'denied' | 'prompt';

interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}
export interface DirHandleLike {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<FileHandleLike | DirHandleLike>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<Access>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<Access>;
}

type Picker = (options?: { mode?: 'readwrite'; id?: string }) => Promise<DirHandleLike>;
const picker = (): Picker | undefined => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;

export function folderSupported(): boolean {
  if (__NATIVE__) return true;
  return typeof window !== 'undefined' && typeof picker() === 'function';
}

const KEY = 'backupDir';

/** The folder chosen earlier, if any. Handles survive in IndexedDB; the permission may need renewing. */
export async function savedFolder(): Promise<DirHandleLike | null> {
  if (__NATIVE__) {
    const info = await nativeFolderInfo().catch(() => null);
    return info?.chosen ? nativeFolderHandle(info.name || 'backup folder') : null;
  }
  const row = await db.meta.get(KEY);
  return (row?.value as DirHandleLike | undefined) ?? null;
}

export async function forgetFolder(): Promise<void> {
  if (__NATIVE__) return forgetNativeFolder();
  await db.meta.delete(KEY);
}

/** Show the folder picker and remember the choice. Returns null if the user cancels. */
export async function chooseFolder(): Promise<DirHandleLike | null> {
  if (__NATIVE__) return pickNativeFolder();
  const pick = picker();
  if (!pick) return null;
  try {
    const handle = await pick.call(window, { mode: 'readwrite', id: 'goi-backup' });
    await db.meta.put({ key: KEY, value: handle });
    return handle;
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Current write permission. With `request`, asks the browser — which only
 * works during a tap or click, and may show a prompt.
 */
export async function folderAccess(handle: DirHandleLike, request: boolean): Promise<Access> {
  try {
    if (!handle.queryPermission) return 'granted';
    const state = await handle.queryPermission({ mode: 'readwrite' });
    if (state !== 'prompt' || !request || !handle.requestPermission) return state;
    return await handle.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'prompt'; // e.g. requested outside a user gesture
  }
}

export async function listFiles(handle: DirHandleLike): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of handle.values()) if (entry.kind === 'file') names.push(entry.name);
  return names;
}

/**
 * Write (or overwrite) one backup file, check it landed intact, then remove
 * this device's oldest daily files beyond `keep`.
 */
export async function writeBackup(
  handle: DirHandleLike,
  name: string,
  text: string,
  deviceLabel: string,
  keep: number,
): Promise<void> {
  const blob = new Blob([text], { type: 'application/json' });
  const file = await handle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
  // Android content URIs don't get atomic writes, so confirm the size rather than assume.
  const written = await file.getFile();
  if (written.size !== blob.size) throw new Error(`wrote ${written.size} of ${blob.size} bytes`);
  for (const old of filesToPrune(await listFiles(handle), deviceLabel, keep)) {
    if (old !== name) await handle.removeEntry(old).catch(() => undefined);
  }
}

/** The most recently modified Goi backup already in the folder, if there is one. */
export async function newestBackup(handle: DirHandleLike): Promise<{ name: string; text: string; modified: number } | null> {
  let best: { name: string; file: File } | null = null;
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file' || !isBackupName(entry.name)) continue;
    const file = await entry.getFile();
    if (!best || file.lastModified > best.file.lastModified) best = { name: entry.name, file };
  }
  return best ? { name: best.name, text: await best.file.text(), modified: best.file.lastModified } : null;
}
