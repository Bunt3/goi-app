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
  // The backup folder, as BackupFolder.java presents it. Survives reloads within a page via sessionStorage.
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('__folder') || 'null');
    } catch {
      return null;
    }
  })();
  st.folder = saved ?? window.__initialFolder ?? { chosen: false, granted: false, name: '', files: {}, nextPick: null, noTruncate: false, noSize: false };
  const persist = () => sessionStorage.setItem('__folder', JSON.stringify(st.folder));
  const bytes = (t) => new TextEncoder().encode(t).length;
  window.androidBridge = { postMessage() {} };
  const methods = ['saveDownload', 'ttsVoices', 'speak', 'stopSpeaking', 'openTtsSettings', 'takeShare', 'openUrl', 'removeListener',
    'pickBackupFolder', 'backupFolderInfo', 'forgetBackupFolder', 'folderList', 'folderRead', 'folderWrite', 'folderDelete'].map((name) => ({ name, rtype: 'promise' }));
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
        case 'pickBackupFolder': {
          const f = st.folder;
          if (!f.nextPick) return Promise.resolve({ picked: false });
          Object.assign(f, { chosen: true, granted: true, name: f.nextPick, nextPick: null });
          persist();
          return Promise.resolve({ picked: true, name: f.name });
        }
        case 'backupFolderInfo':
          return Promise.resolve({ chosen: st.folder.chosen, granted: st.folder.granted, name: st.folder.name });
        case 'forgetBackupFolder':
          Object.assign(st.folder, { chosen: false, granted: false, name: '' });
          persist();
          return Promise.resolve({});
        case 'folderList':
          if (!st.folder.granted) return Promise.reject(new Error('Permission Denial'));
          return Promise.resolve({
            files: Object.entries(st.folder.files).map(([name, f]) => ({ name, size: st.folder.noSize ? -1 : bytes(f.text), modified: f.modified })),
          });
        case 'folderRead': {
          const f = st.folder.files[options.name];
          return f ? Promise.resolve({ text: f.text }) : Promise.reject(new Error(options.name + ' is not in the folder'));
        }
        case 'folderWrite': {
          const old = st.folder.files[options.name]?.text ?? '';
          // A provider that ignores truncation leaves the old file's tail behind.
          const text = st.folder.noTruncate && old.length > options.text.length ? options.text + old.slice(options.text.length) : options.text;
          st.folder.files[options.name] = { text, modified: Date.now() };
          persist();
          return Promise.resolve({});
        }
        case 'folderDelete':
          delete st.folder.files[options.name];
          persist();
          return Promise.resolve({});
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
    let checkPresses = 0;
    const ocrRequests = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('requestfinished', (r) => r.url().includes('/ocr/') && ocrRequests.push(r.url()));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(ORIGIN + '/') && !u.startsWith('blob:') && !u.startsWith('data:')) external.push({ url: u, pressed: checkPresses });
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

    // ---- Folder backups (Android's folder picker) ----
    const folder = () => page.evaluate(() => window.__native.folder);
    // Old files: 20 of this device's automatic backups, one from another device, one manual export.
    await page.evaluate(() => {
      const files = {};
      for (let i = 1; i <= 20; i++) files[`goi-auto_2026-10-${String(i).padStart(2, '0')}_device.json`] = { text: '{"old":true}', modified: 1 };
      files['goi-auto_2026-10-05_pc.json'] = { text: '{"other device":true}', modified: 1 };
      files['goi-backup_2026-10-01_device.json'] = { text: '{"manual":true}', modified: 1 };
      Object.assign(window.__native.folder, { files, nextPick: 'Goi backups' });
    });
    await page.goto(ORIGIN + '/#/more');
    await page.selectOption('#set-autoBackup', 'folder');
    await page.waitForSelector('#auto-folder:has-text("Goi backups")');
    await page.waitForFunction(() => /Backed up to folder/.test(document.getElementById('toast')?.textContent ?? '') || Object.keys(window.__native.folder.files).some((n) => n.includes(new Date().getFullYear() + '-') && !n.includes('2026-10')));
    let f = await folder();
    const names = Object.keys(f.files).sort();
    const autos = names.filter((n) => /^goi-auto_.*_device\.json$/.test(n));
    if (autos.length !== 14) throw new Error(`expected 14 automatic backups for this device, found ${autos.length}: ${names.join(', ')}`);
    if (!names.includes('goi-auto_2026-10-05_pc.json') || !names.includes('goi-backup_2026-10-01_device.json')) throw new Error('another device’s file or a manual export was deleted');
    const fresh = autos.find((n) => !n.startsWith('goi-auto_2026-10-'));
    const parsed = JSON.parse(f.files[fresh].text);
    if (parsed.app !== 'goi-app' || !(parsed.cards.length > 50)) throw new Error('the folder backup is not a full backup');
    ok(`choosing a folder writes a backup at once (${fresh}, ${parsed.cards.length} cards) and keeps only the newest 14 of this device’s automatic files; other files untouched`);

    // A backup is written again after a change, silently (debounced) — check the manual button instead of waiting 20 s.
    await page.evaluate(() => (window.__native.folder.noTruncate = true));
    await page.evaluate((name) => (window.__native.folder.files[name].text += ' '.repeat(5000)), fresh);
    const downloadsBefore = (await calls(page, 'saveDownload')).length;
    await page.click('#backup-now');
    await page.waitForFunction((n) => window.__native.calls.filter((c) => c.method === 'saveDownload').length > n, downloadsBefore, { timeout: 15000 });
    const fallback = (await calls(page, 'saveDownload')).at(-1).options.name;
    if (!fallback.startsWith('goi-auto_')) throw new Error('fallback saved ' + fallback);
    ok('a folder that doesn’t truncate on overwrite is caught by the size check, and the backup goes to Downloads instead');
    await page.evaluate(() => (window.__native.folder.noTruncate = false));

    await page.evaluate(() => (window.__native.folder.noSize = true));
    await page.click('#backup-now');
    await page.waitForFunction(() => /Backed up to folder “Goi backups”/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 15000 });
    f = await folder();
    if (JSON.parse(f.files[fresh].text).app !== 'goi-app') throw new Error('the overwritten backup is not valid JSON');
    ok('a folder that reports no file sizes is checked by reading the file back');
    await page.evaluate(() => (window.__native.folder.noSize = false));

    await page.evaluate(() => {
      window.__native.folder.granted = false;
      sessionStorage.setItem('__folder', JSON.stringify(window.__native.folder));
    });
    await page.reload();
    await page.waitForSelector('#auto-folder:has-text("permission needed")');
    ok('a folder Android no longer lets the app write to is shown as needing permission');
    await page.evaluate(() => {
      window.__native.folder.granted = true;
      sessionStorage.setItem('__folder', JSON.stringify(window.__native.folder));
    });

    // A different phone choosing a folder that already holds more data: review first, write nothing.
    const backupText = f.files[fresh].text;
    const other = await browser.newContext({ viewport: { width: 400, height: 800 } });
    // Init scripts run in the order added: the folder's contents must exist before the fake reads them.
    await other.addInitScript((text) => {
      window.__initialFolder = { chosen: false, granted: false, name: '', files: { 'goi-auto_2026-11-01_phone.json': { text, modified: 2 } }, nextPick: 'Shared drive', noTruncate: false, noSize: false };
    }, backupText);
    await other.addInitScript(fakeNative);
    const p2 = await other.newPage();
    p2.on('pageerror', (e) => errors.push(String(e)));
    await p2.goto(ORIGIN + '/#/more');
    await p2.waitForSelector('#set-autoBackup');
    await p2.selectOption('#set-autoBackup', 'folder');
    // (A toast says so too, but the dictionary's own toasts can replace it in a fresh install.)
    await p2.waitForSelector('#import-summary:has-text("Shared drive")', { timeout: 15000 });
    const f2 = await p2.evaluate(() => window.__native.folder);
    if (Object.keys(f2.files).length !== 1) throw new Error('wrote into a folder holding data this device lacks: ' + Object.keys(f2.files).join(', '));
    await other.close();
    ok('a folder holding data this device lacks is offered for import first, and nothing is written');

    // Update check: GitHub's answer is faked here; the request must happen only on a press.
    const API = 'https://api.github.com/repos/Bunt3/goi-app/releases/latest';
    let answer = { status: 200, body: { tag_name: 'apk-v9.9.0', name: 'Goi 9.9.0 (Android)', body: '## New in 9.9.0\n\n- **Something** new', html_url: 'https://github.com/Bunt3/goi-app/releases/tag/apk-v9.9.0', assets: [{ name: 'goi-9.9.0.apk', browser_download_url: 'https://github.com/Bunt3/goi-app/releases/download/apk-v9.9.0/goi-9.9.0.apk' }] } };
    await context.route(API, (route) => route.fulfill({ status: answer.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer.body) }));
    await page.goto(ORIGIN + '/#/more');
    await page.waitForSelector('#update-check');
    if (external.length) throw new Error('requests outside the app before pressing Check for updates: ' + JSON.stringify(external));
    checkPresses++;
    await page.click('#update-check');
    await page.waitForSelector('#update-status:has-text("Version 9.9.0 is available")');
    if (!(await page.textContent('#update-result details')).includes('Something new')) throw new Error('release notes not shown as plain text');
    await page.click('#update-download');
    await page.waitForFunction(() => window.__native.calls.some((c) => c.method === 'openUrl'));
    const opened = (await calls(page, 'openUrl'))[0].options.url;
    if (opened !== 'https://github.com/Bunt3/goi-app/releases/download/apk-v9.9.0/goi-9.9.0.apk') throw new Error('download opened ' + opened);
    ok('Check for updates finds a newer release, shows its notes, and Download opens the APK link in the browser');
    answer = { status: 404, body: { message: 'Not Found' } };
    checkPresses++;
    await page.click('#update-check');
    await page.waitForSelector('#update-status:has-text("private")');
    await page.waitForSelector('#update-page');
    ok('a private repository (404) is explained, with a link to the releases page');
    const strays = external.filter((r) => r.url !== API || r.pressed === 0);
    if (strays.length) throw new Error('requests outside the app: ' + JSON.stringify(strays));
    if (external.length !== checkPresses) throw new Error(`expected one GitHub request per press, got ${external.length} for ${checkPresses}`);
    if (errors.length) throw new Error('page errors: ' + errors.join('\n'));
    ok('no requests outside the app except one to GitHub per press of Check for updates; no page errors');
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
