import './styles.css';
import { applyTheme, ensurePersistence, mountShell, register, store } from './ui/app';
import { installBackupHooks } from './ui/autobackup';
import { h, toast } from './ui/dom';
import { homeView } from './ui/home';
import { reviewView } from './ui/review';
import { addView, editView } from './ui/add';
import { dictView } from './ui/dictview';
import { setUiLang } from './ui/i18n';
import { browseView } from './ui/browse';
import { bulkView } from './ui/bulk';
import { captureView } from './ui/capture';
import { listenView } from './ui/listen';
import { statsView } from './ui/stats';
import { moreView } from './ui/more';

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
  register('browse', browseView);
  register('bulk', bulkView);
  register('capture', captureView);
  register('listen', listenView);
  register('stats', statsView);
  register('more', moreView);
  mountShell(root);
  if (store.settings.uiLang === 'ja') setUiLang('ja');
  if (store.cards.size > 0) void ensurePersistence();
  installBackupHooks();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
