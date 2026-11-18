import './styles.css';
import { applyTheme, ensurePersistence, mountShell, refresh, register, store } from './ui/app';
import { installBackupHooks } from './ui/autobackup';
import { h, toast } from './ui/dom';
import { homeView } from './ui/home';
import { reviewView } from './ui/review';
import { addView, editView } from './ui/add';
import { dictView } from './ui/dictview';
import { checkerView } from './ui/checker';
import { keigoView } from './ui/keigo';
import { readAppShare, readShare } from './share';
import { onAppShare, takeAppShare } from './native';
import { setUiLang } from './ui/i18n';
import { browseView } from './ui/browse';
import { bulkView } from './ui/bulk';
import { captureView, setPendingShare } from './ui/capture';
import { listenView } from './ui/listen';
import { statsView } from './ui/stats';
import { moreView } from './ui/more';
import { prepareBundledDict } from './ui/dict';

/**
 * APK: take text Android handed over, if any, and queue it for Capture.
 * On start the Capture screen replaces the first page; later it is pushed
 * by the caller, so Back returns to where the owner was. True if there was text.
 */
async function takeNativeShare(onStart: boolean): Promise<boolean> {
  let raw;
  try {
    raw = await takeAppShare();
  } catch (err) {
    console.warn('Could not read text from another app.', err);
    return false;
  }
  const shared = raw ? readAppShare(raw) : null;
  if (!shared) return false;
  setPendingShare(shared);
  if (onStart) history.replaceState(null, '', location.pathname + '#/capture');
  return true;
}

async function start(): Promise<void> {
  const root = document.getElementById('app')!;
  try {
    await store.load();
  } catch (err) {
    // IndexedDB can be unavailable (e.g. Firefox private windows with storage blocked).
    root.append(
      h(
        'div',
        { class: 'page' },
        h('h1', null, 'Storage is unavailable'),
        h(
          'p',
          null,
          'Goi keeps everything in this browser’s IndexedDB, and the browser refused to open it. ' +
            'This usually means a private window or blocked site data. Open the app in a normal window.',
        ),
        h('p', { class: 'muted' }, String(err)),
      ),
    );
    return;
  }
  applyTheme();
  register('home', homeView);
  register('review', reviewView);
  register('add', addView);
  register('edit', editView);
  register('dict', dictView);
  register('check', checkerView);
  register('keigo', keigoView);
  register('browse', browseView);
  register('bulk', bulkView);
  register('capture', captureView);
  register('listen', listenView);
  register('stats', statsView);
  register('more', moreView);
  // Opened from another app's share sheet: /goi-app/share?title=…&text=…&url=…
  if (location.pathname.endsWith('/share')) {
    const shared = readShare(new URLSearchParams(location.search));
    history.replaceState(null, '', import.meta.env.BASE_URL + '#/capture');
    if (shared) setPendingShare(shared);
  }
  // APK: text from Android's text-selection menu ("Goi") or share sheet.
  if (__NATIVE__) await takeNativeShare(true);
  mountShell(root);
  if (store.settings.uiLang === 'ja') setUiLang('ja');
  if (store.cards.size > 0) void ensurePersistence();
  installBackupHooks();

  // The APK has every file on the device already and is updated as a whole.
  if (__NATIVE__) {
    void prepareBundledDict();
    // Text sent while the app is already open: show it in Capture.
    void onAppShare(async () => {
      if (!(await takeNativeShare(false))) return;
      if (location.hash === '#/capture') refresh();
      else location.hash = '#/capture';
    }).catch((err) => console.warn('Incoming text from other apps is unavailable.', err));
  }
  else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A newer build took over. Never reload on our own: a review may be in progress.
      if (hadController) toast('App updated.', { label: 'Reload', run: () => location.reload() }, 15_000);
    });
    try {
      await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL });
    } catch (err) {
      console.warn('Service worker registration failed; the app will not work offline.', err);
    }
  }
}

void start();
