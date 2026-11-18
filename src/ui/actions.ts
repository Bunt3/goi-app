import { buildAnkiTsv } from '../data/anki';
import { exportFilename, serializeExport } from '../data/export';
import { japaneseVoices, speak, ttsSupported } from '../tts';
import { store } from './app';
import { download, toast } from './dom';

/** One-tap manual export: always a downloaded file, whatever the automatic backup mode. */
export async function exportBackup(): Promise<void> {
  const now = Date.now();
  const file = await store.export(now, 'manual export');
  try {
    await download(exportFilename('backup', store.settings.deviceLabel, now), serializeExport(file), 'application/json');
  } catch (err) {
    toast(`The backup was not saved (${(err as Error)?.message ?? err}). Try again.`, undefined, 8000);
    return;
  }
  toast(`Backup saved: ${file.cards.filter((c) => !c.deleted).length} cards, ${file.reviewLogs.length} reviews.`);
}

/** Same backup through the OS share sheet (Android: send to Drive, email, Quick Share…). */
export async function shareBackup(): Promise<void> {
  const now = Date.now();
  const file = await store.export(now, 'shared file');
  const f = new File([serializeExport(file)], exportFilename('backup', store.settings.deviceLabel, now), {
    type: 'application/json',
  });
  try {
    await navigator.share({ files: [f], title: 'Goi backup' });
  } catch (err) {
    if ((err as DOMException)?.name !== 'AbortError') toast('Sharing failed. Use “Export backup” instead.');
  }
}

export function canShareFiles(): boolean {
  try {
    const probe = new File(['{}'], 'goi.json', { type: 'application/json' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function exportAnki(): Promise<void> {
  const now = Date.now();
  const cards = store.live();
  try {
    await download(exportFilename('anki', store.settings.deviceLabel, now), buildAnkiTsv(cards), 'text/tab-separated-values');
  } catch (err) {
    toast(`The Anki file was not saved (${(err as Error)?.message ?? err}). Try again.`, undefined, 8000);
    return;
  }
  toast(`Anki file saved: ${cards.length} notes.`);
}

/** Speak from a button on a card. Says why, in words, if it can't. */
export async function speakOrExplain(text: string): Promise<void> {
  if (!text.trim()) return;
  if (!ttsSupported()) {
    toast('This browser has no speech synthesis. See the Listen tab.');
    return;
  }
  const voices = await japaneseVoices(1500);
  if (voices.length === 0) {
    toast('No Japanese voice is installed on this device. The Listen tab explains how to add one.', undefined, 6000);
    return;
  }
  try {
    await speak(text, { voiceURI: store.settings.ttsVoiceURI, rate: store.settings.ttsRate });
  } catch (err) {
    toast(String((err as Error).message ?? err));
  }
}
