/**
 * Smoke test of the Android build's web part (dist-android/) in headless
 * Chromium. The native side can't run here, so this checks what the web code
 * does differently in the APK: served from the root, no service worker, the
 * bundled dictionary prepared on start without being asked (offline), no
 * Remove button, and a failed native save reported instead of silently lost.
 *
 * Run after `npm run build:android:e2e` (or the build step alone):
 *   node e2e/android-smoke.cjs
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'http://localhost:4174';

function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--mode', 'android', '--port', '4174', '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview server did not start')), 15000);
    proc.stdout.on('data', (d) => {
      if (String(d).includes('4174')) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.on('exit', (code) => reject(new Error('preview server exited with ' + code)));
  });
}

function ok(msg) {
  console.log('  ✓ ' + msg);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  let failed = false;
  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 800 } });
    // In the APK the files are local, so the phone being offline must not stop
    // the dictionary. Here the files come from a server, so report "offline"
    // to the page instead of cutting the connection.
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }));
    const page = await context.newPage();
    const errors = [];
    const external = [];
    const ocrRequests = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('requestfinished', (r) => r.url().includes('/ocr/') && ocrRequests.push(r.url()));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(ORIGIN + '/') && !u.startsWith('blob:') && !u.startsWith('data:')) external.push(u);
    });

    await page.goto(ORIGIN + '/');
    await page.waitForSelector('nav, .tabs, #app *', { timeout: 15000 });
    ok('the app loads from the root path');

    await page.goto(ORIGIN + '/#/more');
    await page.waitForFunction(() => /Installed:/.test(document.getElementById('dict-status')?.textContent ?? ''), null, { timeout: 60000 });
    ok('the bundled dictionary is prepared on start without a button, while offline');
    if (await page.$('#dict-remove')) throw new Error('Remove dictionary should be hidden in the APK');
    if (await page.$('#dict-install')) throw new Error('no install button expected once prepared');
    ok('no Remove or Download button in the APK');

    const sw = await page.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0));
    if (sw !== 0) throw new Error('the APK build must not register a service worker');
    ok('no service worker');

    // Text recognition reads the un-gzipped model the APK carries.
    const img = await context.newPage();
    await img.setViewportSize({ width: 900, height: 200 });
    await img.setContent('<body style="margin:0;padding:40px;background:#fff;color:#111;font:40px/1.9 IPAGothic,sans-serif">少々お待ちください。</body>');
    const png = await img.screenshot();
    await img.close();
    await page.goto(ORIGIN + '/#/capture');
    await page.setInputFiles('#capture-image', { name: 'text.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#crop-frame');
    await page.click('#ocr-read');
    await page.waitForFunction(() => document.querySelector('#capture-text').value.trim() !== '', null, { timeout: 180000 });
    const read = (await page.inputValue('#capture-text')).replace(/\s/g, '');
    if (!read.includes('お待ち')) throw new Error('OCR read ' + JSON.stringify(read));
    if (!ocrRequests.some((u) => u.endsWith('/ocr/lang/jpn.traineddata'))) throw new Error('OCR did not load the plain model: ' + ocrRequests.join(', '));
    ok('text recognition works with the plain model file → ' + JSON.stringify(read));

    // Without the native side, the save must fail loudly, not pretend to work.
    await page.goto(ORIGIN + '/#/more');
    await page.click('#export-anki');
    await page.waitForFunction(() => /not saved/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 10000 });
    ok('a failed native save is reported: ' + (await page.textContent('#toast')).trim());

    if (external.length) throw new Error('requests outside the app: ' + external.join(', '));
    if (errors.length) throw new Error('page errors: ' + errors.join('\n'));
    ok('no requests outside the app; no page errors');
    console.log('\nAndroid smoke test passed.');
  } catch (err) {
    failed = true;
    console.error('\n✗ ' + (err && err.stack ? err.stack : err));
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(failed ? 1 : 0);
}

main();
