/**
 * The offline dictionary from the UI's side: whether one is offered and
 * installed, installing it through a worker, and lookups. Everything is
 * same-origin: dict/manifest.json and the data file it names.
 */
import type { DictManifest } from '../dict/entry';
import { cardFields, labelsFor, lookupWord, type DictFields, type DictMatch } from '../dict/lookup';
import { DictDB, DICT_DB_NAME, findEntries, installState, type InstalledDict } from '../dictdb';
import type { InstallMessage, InstallRequest } from '../dict-install.worker';
import { h } from './dom';

export type DictStatus =
  | { state: 'checking' }
  /** No dictionary in this build, or it can't be checked (offline before installing). */
  | { state: 'unavailable'; reason: string }
  | { state: 'available'; manifest: DictManifest; interrupted: boolean }
  | { state: 'installing'; manifest: DictManifest; entries: number; bytes: number }
  | { state: 'installed'; info: InstalledDict; update: DictManifest | null }
  | { state: 'failed'; manifest: DictManifest; message: string };

const BASE = import.meta.env.BASE_URL + 'dict/';
let status: DictStatus = { state: 'checking' };
let db: DictDB | null = null;
let installed: InstalledDict | null = null;
const listeners = new Set<(s: DictStatus) => void>();
let checked: Promise<void> | null = null;

function dictDb(): DictDB {
  db ??= new DictDB();
  return db;
}

function set(next: DictStatus): void {
  status = next;
  for (const fn of listeners) fn(status);
}

export function dictStatus(): DictStatus {
  return status;
}

/** Subscribe to status changes; returns the unsubscribe function. */
export function onDictStatus(fn: (s: DictStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function fetchManifest(): Promise<DictManifest | 'missing' | 'offline'> {
  // Skip the request when the browser knows it is offline (a failed fetch is logged as an error).
  if (navigator.onLine === false) return 'offline';
  let res: Response;
  try {
    res = await fetch(BASE + 'manifest.json', { cache: 'no-store' });
  } catch {
    return 'offline';
  }
  if (!res.ok) return 'missing';
  try {
    const m = (await res.json()) as DictManifest;
    return typeof m?.file === 'string' && typeof m.version === 'string' ? m : 'missing';
  } catch {
    return 'missing'; // e.g. a server answering unknown paths with the app page
  }
}

/** Work out the status from what is installed and what this build offers. */
export function checkDict(): Promise<void> {
  if (status.state === 'installing') return Promise.resolve();
  checked = (async () => {
    try {
      installed = await installState(dictDb());
    } catch {
      installed = null; // IndexedDB unavailable (private window in some browsers)
    }
    const done = installed?.complete ? installed : null;
    if (done) set({ state: 'installed', info: done, update: null });
    const m = await fetchManifest();
    if (typeof m === 'string') {
      if (!done) {
        set({
          state: 'unavailable',
          reason:
            m === 'offline'
              ? 'The dictionary can’t be downloaded while offline. Connect and open this screen again.'
              : 'Dictionary not available in this build.',
        });
      }
      return;
    }
    if (done) set({ state: 'installed', info: done, update: m.version !== done.version ? m : null });
    else set({ state: 'available', manifest: m, interrupted: installed !== null });
  })();
  return checked;
}

/** True once a complete dictionary is on this device. Lookups need no network. */
export async function dictReady(): Promise<boolean> {
  if (!checked) void checkDict();
  if (installed?.complete) return true;
  await checked;
  return installed?.complete === true;
}

let worker: Worker | null = null;

/** Download and install (or reinstall) the dictionary this build offers. */
export function installDict(manifest: DictManifest): void {
  if (worker) return;
  set({ state: 'installing', manifest, entries: 0, bytes: 0 });
  worker = new Worker(new URL('../dict-install.worker.ts', import.meta.url), { type: 'module' });
  const finish = async (failure?: string) => {
    worker?.terminate();
    worker = null;
    if (failure) {
      installed = await installState(dictDb()).catch(() => null);
      set({ state: 'failed', manifest, message: failure });
    } else {
      installed = await installState(dictDb());
      set(installed?.complete ? { state: 'installed', info: installed, update: null } : { state: 'failed', manifest, message: 'the install did not finish' });
    }
  };
  worker.onmessage = (e: MessageEvent<InstallMessage>) => {
    const m = e.data;
    if (m.type === 'progress') set({ state: 'installing', manifest, entries: m.entries, bytes: m.bytes });
    else if (m.type === 'done') void finish();
    else void finish(m.message);
  };
  worker.onerror = (e) => void finish(e.message || 'the installer stopped');
  const req: InstallRequest = { url: BASE + manifest.file, manifest };
  worker.postMessage(req);
}

/** Delete the dictionary database. Cards are untouched. */
export async function removeDict(): Promise<void> {
  worker?.terminate();
  worker = null;
  db?.close();
  db = null;
  installed = null;
  await DictDB.delete(DICT_DB_NAME);
  checked = null;
  await checkDict();
}

/** Dictionary matches for the text, best first; [] when no dictionary is installed. */
export async function dictLookup(text: string): Promise<DictMatch[]> {
  if (!(await dictReady())) return [];
  try {
    return await lookupWord(text, (terms) => findEntries(dictDb(), terms));
  } catch {
    return [];
  }
}

export function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
}

// ---- Candidate list, shared by the picker, Add and Edit ---------------------------

/** One button per match. `chosen` is highlighted. */
export function candidateList(matches: DictMatch[], chosen: DictMatch | null, onPick: (m: DictMatch) => void, max = 5): HTMLElement {
  return h(
    'div',
    { class: 'dict-cands', role: 'list' },
    matches.slice(0, max).map((m) => {
      const f = cardFields(m);
      const on = m === chosen;
      return h(
        'button',
        { type: 'button', class: 'dict-cand' + (on ? ' on' : ''), 'aria-pressed': String(on), role: 'listitem', onclick: () => onPick(m) },
        h(
          'span',
          { class: 'dict-head' },
          h('b', { lang: 'ja' }, f.word),
          f.reading !== f.word ? h('span', { class: 'muted', lang: 'ja' }, f.reading) : null,
          ...labelsFor(m).map((l) => h('span', { class: 'badge' }, l)),
        ),
        h('span', { class: 'small dict-gloss' }, f.meaning_en),
        m.reasons.length ? h('span', { class: 'muted small' }, m.reasons.join(' · ')) : null,
      );
    }),
    matches.length > max ? h('p', { class: 'muted small', style: 'margin:0' }, `${matches.length - max} more not shown.`) : null,
  );
}

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Fills form fields from a dictionary match without ever overwriting what the
 * owner typed: a field is filled only when it is empty or still holds a value
 * this helper (or another automatic source, via markAuto) put there.
 */
export class AutoFill {
  private auto = new Map<Field, string>();
  /** Values the dictionary wrote, and what each field held before. */
  private written = new Map<Field, { value: string; before: string }>();
  chosen: DictMatch | null = null;

  constructor(private readonly fields: Partial<Record<'word' | 'reading' | 'meaning_en' | 'example_ja' | 'example_en', Field>>) {}

  /** Record a value written by something other than the owner (the IME reading, the picked text). */
  markAuto(el: Field, value: string): void {
    this.auto.set(el, value.trim());
  }

  private writable(el: Field): boolean {
    const cur = el.value.trim();
    return cur === '' || cur === this.auto.get(el);
  }

  /** Apply a match. The word is replaced only when `word` is true: a tapped candidate, or the picker's own selection. */
  apply(m: DictMatch, opts: { word: boolean }): DictFields {
    const f = cardFields(m);
    this.chosen = m;
    for (const key of ['word', 'reading', 'meaning_en', 'example_ja', 'example_en'] as const) {
      const el = this.fields[key];
      if (!el) continue;
      // The word follows the choice; every other field is filled only if the owner hasn't typed in it.
      if (key === 'word' ? !opts.word : !this.writable(el)) continue;
      // An example and its translation travel together, and only into an empty pair.
      if (key === 'example_en' && this.fields.example_ja && this.fields.example_ja.value.trim() !== f.example_ja) continue;
      const before = this.written.get(el)?.before ?? el.value;
      el.value = f[key];
      this.auto.set(el, f[key]);
      this.written.set(el, { value: f[key], before });
    }
    return f;
  }

  /** Take back what the dictionary wrote (where still unedited), e.g. when the word changes. */
  undo(): void {
    for (const [el, w] of this.written) {
      if (el.value.trim() !== w.value) continue;
      el.value = w.before;
      if (w.before) this.auto.set(el, w.before.trim());
      else this.auto.delete(el);
    }
    this.written.clear();
    this.chosen = null;
  }

  /** Forget everything, after the form is cleared. */
  reset(): void {
    this.auto.clear();
    this.written.clear();
    this.chosen = null;
  }

  /** True when a reading or meaning from the dictionary is still in the form. */
  used(): boolean {
    for (const key of ['reading', 'meaning_en'] as const) {
      const el = this.fields[key];
      if (el && this.chosen && el.value.trim() !== '' && el.value.trim() === this.auto.get(el) && el.value.trim() === cardFields(this.chosen)[key]) return true;
    }
    return false;
  }

  /** Tags and register to add when the card is saved, if the dictionary's values were kept. */
  extras(): { tags: string[]; register: DictFields['register'] } {
    if (!this.chosen || !this.used()) return { tags: [], register: null };
    const f = cardFields(this.chosen);
    return { tags: f.tags, register: f.register };
  }
}
