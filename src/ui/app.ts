import { Store } from '../store';
import { clear, h } from './dom';

export const store = new Store();

export interface View {
  el: HTMLElement;
  /** Called when navigating away (timers, key handlers, speech). */
  destroy?: () => void;
  /** Hide the tab bar (used by the review screen). */
  fullscreen?: boolean;
}

export type Route = (arg: string, params: URLSearchParams) => View | Promise<View>;

const routes = new Map<string, Route>();
let current: View | null = null;
let navToken = 0;

const TABS: { route: string; label: string; icon: string }[] = [
  { route: 'home', label: 'Today', icon: '今' },
  { route: 'add', label: 'Add', icon: '＋' },
  { route: 'browse', label: 'Cards', icon: '札' },
  { route: 'listen', label: 'Listen', icon: '聴' },
  { route: 'more', label: 'More', icon: '⋯' },
];

/** Which tab is lit for routes that aren't tabs themselves. */
const TAB_FOR: Record<string, string> = { edit: 'browse', bulk: 'add', capture: 'add', dict: 'add', check: 'more', keigo: 'home', stats: 'more', review: 'home' };

export function register(name: string, route: Route): void {
  routes.set(name, route);
}

export function go(path: string): void {
  if (location.hash === '#/' + path) void render();
  else location.hash = '#/' + path;
}

export function parseHash(): { name: string; arg: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const [name = '', ...rest] = path.split('/');
  return { name: name || 'home', arg: decodeURIComponent(rest.join('/')), params: new URLSearchParams(query) };
}

async function render(): Promise<void> {
  const token = ++navToken;
  const { name, arg, params } = parseHash();
  const route = routes.get(name) ?? routes.get('home')!;
  current?.destroy?.();
  current = null;
  const view = await route(arg, params);
  if (token !== navToken) {
    view.destroy?.();
    return;
  }
  current = view;
  const main = document.getElementById('view')!;
  clear(main);
  main.append(view.el);
  // The new screen fades in (140 ms). A plain animation, not a View
  // Transition, so taps are never held up while it runs.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    view.el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'linear' });
  }
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  document.body.classList.toggle('fullscreen', !!view.fullscreen);
  const active = TAB_FOR[name] ?? name;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('#tabs a')) {
    a.classList.toggle('active', a.dataset.route === active);
  }
}

/** Re-run the current route (after data changes that affect the whole screen). */
export function refresh(): void {
  void render();
}

export function applyTheme(): void {
  const theme = store.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f1ea' : '#121416');
}

export function mountShell(root: HTMLElement): void {
  clear(root);
  root.append(
    h('main', { id: 'view' }),
    h(
      'nav',
      { id: 'tabs', 'aria-label': 'Main' },
      TABS.map((t) =>
        h(
          'a',
          { href: '#/' + t.route, dataset: { route: t.route } },
          h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon),
          h('span', { class: 'tab-label' }, t.label),
        ),
      ),
    ),
    h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }),
  );
  window.addEventListener('hashchange', () => void render());
  void render();
}

/**
 * Ask the browser not to evict our IndexedDB data under storage pressure.
 * Called once there is something worth keeping. Firefox shows a permission
 * prompt for this, so the automatic request is made at most once a week;
 * the More screen has a button to ask again on demand.
 */
const PERSIST_KEY = 'goi.persistAskedAt';
let persistChecked = false;
export async function ensurePersistence(): Promise<void> {
  if (persistChecked || !navigator.storage?.persist) return;
  persistChecked = true;
  try {
    if (await navigator.storage.persisted()) return;
    const last = Number(localStorage.getItem(PERSIST_KEY) ?? 0);
    if (Date.now() - last < 7 * 86_400_000) return;
    localStorage.setItem(PERSIST_KEY, String(Date.now()));
    await navigator.storage.persist();
  } catch {
    /* not fatal: export remains the real backup */
  }
}
