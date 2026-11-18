/**
 * Smoke test of the Android build's web part (dist-android/) in headless
 * Chromium. The Java side can't run here, so a fake stands in for it with the
 * same contract as Capacitor's Android bridge (window.androidBridge,
 * Capacitor.PluginHeaders, nativePromise/nativeCallback). That checks the
 * calls the page makes and how it handles the answers: served from the root,
 * no service worker, the bundled dictionary prepared offline without a
 * button, saving to Downloads (and a failed save reported), speech through
 * the native engine, and text from Android's selection menu or share sheet,
 * both on start and while the app is open.
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

/**
 * Runs in the page before the app. Mirrors GoiNativePlugin.java: method
 * names, options and result shapes must match it.
 */
function fakeNative() {
  const st = (window.__native = { calls: [], voices: [], failSave: false, share: null, listeners: [], nextId: 1 });
  window.androidBridge = { postMessage() {} };
  const methods = ['saveDownload', 'ttsVoices', 'speak', 'stopSpeaking', 'openTtsSettings', 'takeShare', 'removeListener'].map((name) => ({ name, rtype: 'promise' }));
  methods.push({ name: 'addListener', rtype: 'callback' });
  window.Capacitor = {
    PluginHeaders: [{ name: 'GoiNative', methods }],
    nativePromise(plugin, method, options) {
      st.calls.push({ plugin, method, options });
      switch (method) {
        case 'saveDownload':
          return st.failSave ? Promise.reject(new Error('Saving was cancelled')) : Promise.resolve({ where: 'Downloads' });
        case 'ttsVoices':
          return Promise.resolve({ voices: st.voices, engine: 'com.google.android.tts' });
        case 'speak':
          return st.voices.length ? Promise.resolve() : Promise.reject(new Error('No Japanese voice is installed on this phone.'));
        case 'takeShare': {
          const share = st.share ?? window.__initialShare ?? null;
          st.share = null;
          window.__initialShare = null;
          return Promise.resolve(share ? { share } : {});
        }
        default:
          return Promise.resolve({});
      }
    },
    nativeCallback(plugin, method, options, callback) {
      st.calls.push({ plugin, method, options });
      st.listeners.push({ event: options.eventName, callback });
      return String(st.nextId++);
    },
  };
  // What GoiNativePlugin.handleOnNewIntent does: hold the text, then fire "share".
  window.__deliverShare = (share) => {
    st.share = share;
    for (const l of st.listeners) if (l.event === 'share') l.callback({});
  };
}

const calls = (page, method) => page.evaluate((m) => window.__native.calls.filter((c) => c.method === m), method);

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
    await context.addInitScript(fakeNative);
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

    // Saving goes to the native side; a failure is reported, not lost.
    await page.goto(ORIGIN + '/#/more');
    await page.click('#load-seed');
    await page.waitForSelector('#seed-result:has-text("Added")');
    await page.click('#export-anki');
    await page.waitForFunction(() => /Anki file saved/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 10000 });
    const saves = await calls(page, 'saveDownload');
    if (saves.length !== 1 || !/^goi-anki_.*\.tsv$/.test(saves[0].options.name) || !saves[0].options.text.startsWith('#separator')) {
      throw new Error('unexpected saveDownload call: ' + JSON.stringify(saves.map((c) => ({ ...c.options, text: c.options.text.slice(0, 20) }))));
    }
    ok('Export for Anki is written through the native side: ' + saves[0].options.name);
    await page.evaluate(() => (window.__native.failSave = true));
    await page.click('#export-anki');
    await page.waitForFunction(() => /not saved/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 10000 });
    ok('a failed save is reported: ' + (await page.textContent('#toast')).trim());
    await page.evaluate(() => (window.__native.failSave = false));

    // Speech: no voice yet → help with a button to the phone's settings; after installing one, playback.
    await page.goto(ORIGIN + '/#/listen');
    await page.waitForSelector('#tts-settings');
    await page.click('#tts-settings');
    if ((await calls(page, 'openTtsSettings')).length !== 1) throw new Error('the settings button did not ask the native side');
    ok('with no Japanese voice, Listen explains and opens the phone’s text-to-speech settings');
    await page.evaluate(() => (window.__native.voices = [{ id: 'ja-jp-x-htm-local', label: '日本語 1' }]));
    await page.click('#tts-retry');
    await page.waitForSelector('#tts-voice option[value="ja-jp-x-htm-local"]', { state: 'attached' });
    const lists = await calls(page, 'ttsVoices');
    if (!lists.at(-1).options.refresh) throw new Error('Check again must re-read the installed voices');
    await page.click('#listen-play');
    await page.waitForFunction(() => window.__native.calls.some((c) => c.method === 'speak'));
    const spoken = (await calls(page, 'speak'))[0].options;
    if (!spoken.text || typeof spoken.rate !== 'number' || !/[぀-鿿]/.test(spoken.text)) throw new Error('unexpected speak call: ' + JSON.stringify(spoken));
    ok(`after installing a voice, Check again finds it and Play speaks through the native engine (“${spoken.text.slice(0, 12)}…”, rate ${spoken.rate})`);
    await page.goto(ORIGIN + '/#/home');
    await page.waitForFunction(() => window.__native.calls.some((c) => c.method === 'stopSpeaking'));
    ok('leaving Listen stops the speech');

    // Text sent while the app is open (selection menu or share sheet) opens Capture with it.
    await page.goto(ORIGIN + '/#/more');
    await page.waitForSelector('#export-anki');
    await page.evaluate(() => window.__deliverShare({ text: '了解です、なるはやで対応します', subject: '', app: 'LINE' }));
    await page.waitForFunction(() => location.hash === '#/capture' && document.querySelector('#capture-text')?.value === '了解です、なるはやで対応します');
    if ((await page.inputValue('#capture-source')) !== 'LINE') throw new Error('source should name the app: ' + (await page.inputValue('#capture-source')));
    await page.goBack();
    await page.waitForFunction(() => location.hash === '#/more');
    ok('text sent while the app is open lands in Capture with the app as the source; Back returns to the previous screen');

    // Text that started the app: Capture is the first screen.
    const cold = await context.newPage();
    await cold.addInitScript(() => (window.__initialShare = { text: '根回しが欠かせない。 https://www.nikkei.com/a', subject: '日経新聞', app: 'Chrome' }));
    cold.on('pageerror', (e) => errors.push(String(e)));
    await cold.goto(ORIGIN + '/');
    await cold.waitForFunction(() => location.hash === '#/capture' && document.querySelector('#capture-text')?.value === '根回しが欠かせない。');
    if ((await cold.inputValue('#capture-source')) !== '日経新聞 · nikkei.com') throw new Error('cold-start source: ' + (await cold.inputValue('#capture-source')));
    await cold.close();
    ok('text that starts the app opens straight into Capture, link removed, page as the source');

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
