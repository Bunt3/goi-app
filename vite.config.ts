import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const BASE = '/goi-app/';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Emits sw.js with the list of built files baked in, so the whole app is
 * precached on first visit and works offline afterwards. Hand-rolled to avoid
 * a PWA-plugin dependency.
 */
function serviceWorker(): Plugin {
  return {
    name: 'goi-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      // Files copied from public/ are not in the bundle; list them explicitly.
      const publicFiles = [
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/icon.svg',
      ];
      const all = ['', ...files.filter((f) => f !== 'index.html'), ...publicFiles];
      const version = createHash('sha256')
        .update(
          Object.values(bundle)
            .map((c) => (c.type === 'chunk' ? c.code : String(c.fileName)))
            .join('|'),
        )
        .update(String(Date.now()))
        .digest('hex')
        .slice(0, 12);
      const source = `// Generated at build time. Do not edit.
const VERSION = ${JSON.stringify(version)};
const CACHE = 'goi-' + VERSION;
const BASE = ${JSON.stringify(BASE)};
const FILES = ${JSON.stringify(all)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(BASE + f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('goi-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreVary: some hosts send "Vary: Origin", which would stop precached files matching.
      const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match(BASE, { ignoreVary: true });
        if (shell) return shell;
      }
      return fetch(req);
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version} (${new Date().toISOString().slice(0, 10)})`) },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { TZ: 'Asia/Tokyo' },
  },
});
