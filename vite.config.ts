import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Where the website is served. The Android build (mode "android") is served from the APK's root. */
const WEB_BASE = '/goi-app/';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const ocrVersion = (JSON.parse(readFileSync(new URL('./node_modules/tesseract.js/package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * Emits sw.js with the list of built files baked in, so the whole app is
 * precached on first visit and works offline afterwards. Hand-rolled to avoid
 * a PWA-plugin dependency.
 */
function serviceWorker(BASE: string): Plugin {
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
// The OCR engine and language model are large and change only when the
// library is upgraded, so they are fetched on first use and kept in their
// own cache across app updates instead of being precached.
const OCR_CACHE = 'goi-ocr-' + ${JSON.stringify(ocrVersion)};
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
        Promise.all(keys.filter((k) => k.startsWith('goi-') && k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // The dictionary download goes straight to the network: it is stored in its
  // own database once installed, so a cached copy would only double the space.
  if (url.pathname.startsWith(BASE + 'dict/')) return;
  if (url.pathname.startsWith(BASE + 'ocr/')) {
    event.respondWith(
      caches.open(OCR_CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
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

/**
 * Android packaging un-gzips every asset ending in .gz and drops the suffix,
 * so the app's requests for those names would fail inside the APK. Do it
 * here instead, where it is visible: store the dictionary and OCR model
 * plain (the APK's zip compresses them) and point the dictionary manifest at
 * the plain name. The dictionary installer accepts either form.
 */
function plainAssetsForAndroid(): Plugin {
  let outDir = 'dist-android';
  return {
    name: 'goi-android-plain-assets',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const manifestPath = join(outDir, 'dict', 'manifest.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { file: string };
        if (manifest.file.endsWith('.gz')) {
          const gz = join(outDir, 'dict', manifest.file);
          manifest.file = manifest.file.slice(0, -3);
          writeFileSync(join(outDir, 'dict', manifest.file), gunzipSync(readFileSync(gz)));
          rmSync(gz);
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
        }
      }
      const lang = join(outDir, 'ocr', 'lang');
      if (existsSync(lang)) {
        for (const f of readdirSync(lang).filter((n) => n.endsWith('.gz'))) {
          writeFileSync(join(lang, f.slice(0, -3)), gunzipSync(readFileSync(join(lang, f))));
          rmSync(join(lang, f));
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // The APK (Capacitor) loads the build from its own assets: no base path and
  // no service worker, since every file is already on the device.
  const native = mode === 'android';
  const base = native ? '/' : WEB_BASE;
  return {
    base,
    plugins: native ? [plainAssetsForAndroid()] : [serviceWorker(base)],
    define: {
      __APP_VERSION__: JSON.stringify(`v${pkg.version} (${new Date().toISOString().slice(0, 10)})`),
      __NATIVE__: JSON.stringify(native),
      __APP_SEMVER__: JSON.stringify(pkg.version),
    },
    build: { target: 'es2022', sourcemap: false, outDir: native ? 'dist-android' : 'dist' },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      env: { TZ: 'Asia/Tokyo' },
    },
  };
});
