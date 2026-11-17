/**
 * Headless run-through against the production build:
 *   add card → review → export → clear storage → import → verify restored,
 * plus offline reload and the "replace everything" path.
 *
 *   npm run build && npm run e2e
 *
 * Playwright is not a project dependency; it must be resolvable by Node
 * (e.g. `npm i -g playwright` with NODE_PATH set, or `npm i --no-save playwright`).
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'http://localhost:4173/goi-app/';
const SHOTS = process.env.E2E_SHOTS !== '0';

function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', '4173', '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview server did not start')), 15000);
    proc.stdout.on('data', (d) => {
      if (String(d).includes('4173')) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (code) => reject(new Error('preview server exited with ' + code)));
  });
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, acceptDownloads: true, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const external = [];
  page.on('request', (r) => !r.url().startsWith('http://localhost:4173/') && !r.url().startsWith('blob:') && !r.url().startsWith('data:') && external.push(r.url()));

  let step = 0;
  let persistent = null;
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-${name}.png`) });
  const log = (msg) => console.log('  ✓ ' + msg);

  const exportBackup = async () => {
    await page.goto(URL + '#/more');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
    const file = path.join(OUT, download.suggestedFilename());
    await download.saveAs(file);
    return { file, name: download.suggestedFilename(), data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  const clearStorage = async () => {
    await page.goto('about:blank');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Storage.clearDataForOrigin', { origin: 'http://localhost:4173', storageTypes: 'all' });
    await cdp.detach();
    await page.goto(URL);
    await page.waitForSelector('text=No cards yet');
  };

  try {
    // ---- 1. Fresh start -------------------------------------------------
    await page.goto(URL);
    await page.waitForSelector('text=No cards yet');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark', 'dark mode is the default');
    await shot('empty');
    log('fresh install shows the empty state in dark mode');

    // ---- 2. Add cards ---------------------------------------------------
    await page.click('#tabs a[data-route="add"]');
    await page.fill('#f-word', '承る');
    await page.fill('#f-reading', 'うけたまわる');
    await page.click('#f-details summary');
    await page.fill('#f-meaning-en', 'to receive (an order) — humble');
    await page.fill('#f-example-ja', 'ご注文を承りました。');
    await page.click('#f-tags button:has-text("電話応対")');
    await page.selectOption('#f-register', '謙譲語');
    await page.fill('#f-source', 'e2e test');
    await shot('add-full');
    await page.click('#save-card');
    await page.waitForSelector('#toast.show');

    // Quick add: word + reading only, Enter to save → Inbox.
    const t0 = Date.now();
    await page.fill('#f-word', '按分');
    await page.keyboard.press('Enter');
    await page.keyboard.type('あんぶん');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#toast.show:has-text("Inbox")');
    log(`quick add by keyboard took ${Date.now() - t0} ms; incomplete card went to the Inbox`);

    // Required-field check.
    await page.fill('#f-word', '単語だけ');
    await page.click('#save-card');
    await page.waitForSelector('#add-message:has-text("both needed")');
    await page.fill('#f-word', '');

    await page.click('#tabs a[data-route="browse"]');
    await page.waitForSelector('#card-list .item');
    assert.equal(await page.locator('#card-list .item').count(), 2);
    await page.click('button[data-filter="inbox"]');
    assert.equal(await page.locator('#card-list .item').count(), 1);
    assert.match(await page.locator('#card-list .item').first().innerText(), /按分/);
    await shot('browse-inbox');
    log('browse lists both cards; Inbox filter shows only the incomplete one');

    // ---- 3. Review ------------------------------------------------------
    await page.click('#tabs a[data-route="home"]');
    await page.waitForSelector('#quick-start');
    assert.equal(await page.innerText('#count-new'), '1', 'inbox card is not queued');
    await shot('home');
    await page.click('#quick-start');
    await page.waitForSelector('#reveal');
    assert.equal(await page.getAttribute('.review-body', 'data-direction'), 'recognition');
    assert.equal(await page.locator('.review-body ruby').count(), 0, 'no furigana on the recognition prompt');
    await shot('review-front');
    await page.click('#reveal');
    await page.waitForSelector('.ratings');
    const labels = await page.locator('.ratings button').allInnerTexts();
    assert.equal(labels.length, 4);
    for (const l of labels) assert.match(l, /(<1m|\d+(\.\d)?(m|h|d|mo|y))\s+(Again|Hard|Good|Easy)/, 'each button shows its next interval: ' + l);
    assert.equal(await page.locator('.review-body ruby').count(), 1, 'furigana on the target word only');
    assert.equal(await page.locator('.review-body .example ruby rt').innerText(), 'うけたまわ');
    await shot('review-back');
    await page.click('.ratings button[data-rating="3"]'); // Good → 10 min learning step
    // Only card left, so the learning step is shown again straight away.
    await page.waitForSelector('#reveal');
    // Undo, then answer again.
    await page.click('#undo');
    await page.waitForSelector('.ratings');
    await page.click('.ratings button[data-rating="3"]');
    await page.waitForSelector('#reveal');
    await page.click('#reveal');
    // Ending a session triggers the automatic backup (default mode: a download).
    const autoDownload = page.waitForEvent('download');
    await page.click('.ratings button[data-rating="3"]'); // Good → graduates
    await page.waitForSelector('#summary-line');
    const auto = await autoDownload;
    assert.match(auto.suggestedFilename(), /^goi-auto_\d{4}-\d{2}-\d{2}_device\.json$/);
    const autoFile = path.join(OUT, auto.suggestedFilename());
    await auto.saveAs(autoFile);
    const autoData = JSON.parse(fs.readFileSync(autoFile, 'utf8'));
    assert.equal(autoData.cards.length, 2);
    assert.equal(autoData.reviewLogs.length, 2);
    log('automatic backup: finishing a session downloaded ' + auto.suggestedFilename() + ' without being asked');
    const summary = await page.innerText('#summary-line');
    assert.match(summary, /^2 reviews in \d+:\d\d · 2 remembered\.$/);
    await shot('summary');
    log('review: intervals on all four buttons, undo works, session ends with: "' + summary + '"');
    await page.click('#summary-done');
    await page.waitForSelector('#home-status');

    // ---- 4. Export ------------------------------------------------------
    await page.goto(URL + '#/more');
    await page.fill('#set-deviceLabel', 'e2e phone');
    await page.locator('#set-deviceLabel').blur();
    await page.fill('#set-maxReviewsPerDay', '25');
    await page.locator('#set-maxReviewsPerDay').blur();
    const first = await exportBackup();
    assert.match(first.name, /^goi-backup_\d{4}-\d{2}-\d{2}_e2e-phone\.json$/);
    assert.equal(first.data.app, 'goi-app');
    assert.equal(first.data.schemaVersion, 1);
    assert.equal(first.data.cards.length, 2);
    assert.equal(first.data.reviewLogs.length, 2, 'undone answer left no log behind');
    const reviewed = first.data.cards.find((c) => c.word === '承る');
    assert.equal(reviewed.srs.recognition.state, 2, 'card graduated to review');
    assert.ok(reviewed.productionUnlockedAt > 0, 'production unlocked by the successful recognition review');
    assert.equal(reviewed.srs.production.state, 0);
    await page.waitForSelector('#last-export:has-text("today")');
    log(`export wrote ${first.name} (schema v${first.data.schemaVersion}, 2 cards, 2 review logs)`);

    const [anki] = await Promise.all([page.waitForEvent('download'), page.click('#export-anki')]);
    assert.match(anki.suggestedFilename(), /^goi-anki_\d{4}-\d{2}-\d{2}_e2e-phone\.tsv$/);
    const ankiFile = path.join(OUT, anki.suggestedFilename());
    await anki.saveAs(ankiFile);
    const tsv = fs.readFileSync(ankiFile, 'utf8');
    assert.ok(tsv.startsWith('#separator:tab\n'));
    assert.ok(tsv.includes('承る\tうけたまわる\tto receive (an order) — humble'));
    log('Anki TSV export has headers and the card fields');

    // ---- 5. Offline -----------------------------------------------------
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#tabs');
    await page.click('#tabs a[data-route="browse"]');
    await page.waitForSelector('#card-list .item');
    await context.setOffline(false);
    log('app reloads and works offline from the service worker cache');

    // ---- 6. Clear storage → merge import -------------------------------
    await clearStorage();
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length <= 1), true);
    log('storage cleared: app is back to the empty state');

    await page.goto(URL + '#/more');
    await page.setInputFiles('#import-file', first.file);
    await page.waitForSelector('#import-summary');
    assert.equal(await page.innerText('#sum-added'), '2');
    assert.equal(await page.innerText('#sum-logs'), '2');
    await shot('import-summary');
    // Nothing is written until confirmed.
    assert.equal(await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const tx = r.result.transaction('cards'); const c = tx.objectStore('cards').count(); c.onsuccess = () => { r.result.close(); res(c.result); }; }; })), 0);
    await page.click('#confirm-merge');
    await page.waitForSelector('#toast.show:has-text("Merged")');
    const second = await exportBackup();
    assert.deepEqual(second.data.cards, first.data.cards, 'cards identical after restore');
    assert.deepEqual(second.data.reviewLogs, first.data.reviewLogs, 'review logs identical after restore');
    assert.equal(second.data.settings.maxReviewsPerDay, 40, 'merge leaves this device’s settings alone');
    log('merge import: summary shown before commit, cards + logs + scheduling restored exactly');

    // Importing the same file again is a no-op.
    await page.goto(URL + '#/more');
    await page.setInputFiles('#import-file', first.file);
    await page.waitForSelector('#import-summary');
    assert.equal(await page.isDisabled('#confirm-merge'), true);
    assert.equal(await page.innerText('#sum-added'), '0');
    log('re-importing the same file reports nothing to merge');

    // ---- 7. Clear storage → replace everything -------------------------
    await clearStorage();
    await page.goto(URL + '#/more');
    await page.setInputFiles('#import-file', first.file);
    await page.waitForSelector('#import-summary');
    await page.click('#ask-replace');
    await shot('replace-confirm');
    await page.click('#confirm-replace');
    await page.waitForSelector('#toast.show:has-text("Replaced")');
    const third = await exportBackup();
    assert.deepEqual(third.data.cards, first.data.cards);
    assert.deepEqual(third.data.reviewLogs, first.data.reviewLogs);
    assert.equal(third.data.settings.maxReviewsPerDay, 25, 'replace restores settings from the file');
    assert.equal(third.data.settings.deviceLabel, 'e2e phone');
    log('replace-everything (behind a confirmation) restores cards, logs and settings');

    // ---- 8. Restored data is usable ------------------------------------
    await page.goto(URL + '#/browse?filter=all');
    await page.waitForSelector('#card-list .item');
    await page.click('#card-list .item:has-text("承る")');
    await page.waitForSelector('#f-word');
    assert.equal(await page.inputValue('#f-word'), '承る');
    assert.equal(await page.inputValue('#f-example-ja'), 'ご注文を承りました。');
    assert.equal(await page.inputValue('#f-register'), '謙譲語');
    assert.match(await page.locator('dl.kv').innerText(), /recognition\s+review · due in \d/);
    await shot('edit-restored');
    log('restored card opens with its text, register and review schedule');

    // ---- 9. Other screens render ---------------------------------------
    await page.goto(URL + '#/more');
    await page.click('#load-seed');
    await page.waitForSelector('#seed-result:has-text("Added")');
    const seedText = await page.innerText('#seed-result');
    await page.click('#load-seed');
    await page.waitForSelector('#seed-result:has-text("already loaded")');
    await page.goto(URL + '#/browse?filter=all');
    await page.waitForSelector('#card-list .item');
    await page.selectOption('#filter-tag', 'seed-unverified');
    const seedCount = Number((await page.innerText('#browse-count')).split(' ')[0]);
    assert.ok(seedCount >= 140, 'seed deck loaded: ' + seedCount);
    await page.fill('#search', 'りんぎ');
    assert.equal(await page.locator('#card-list .item').count(), 1);
    await page.fill('#search', '');
    await shot('browse-seed');
    log(`seed deck: ${seedText.split('.')[0]}; second press adds nothing; all tagged seed-unverified`);

    await page.goto(URL + '#/home');
    await page.waitForSelector('#quick-start');
    assert.equal(await page.innerText('#count-new'), '7', 'new cards capped at 8 per day, one already used today');
    await shot('home-seeded');
    await page.click('#full-start');
    await page.waitForSelector('#reveal');
    await page.click('#reveal');
    await shot('review-seed-back');
    await page.click('.ratings button[data-rating="4"]');
    await page.waitForSelector('#reveal');
    await page.keyboard.press('Escape');

    await page.goto(URL + '#/stats');
    await page.waitForSelector('#forecast');
    assert.equal(await page.innerText('#stat-learned'), '2');
    await shot('stats');

    await page.goto(URL + '#/bulk');
    await page.fill('#bulk-text', '単語\t読み\t意味\n稟議\tりんぎ\tdup of seed\n新規語\tしんきご\ta brand new word\n読みなし\t\t');
    await page.click('#bulk-parse');
    await page.waitForSelector('#bulk-summary');
    assert.match(await page.innerText('#bulk-summary'), /2 cards will be added/);
    assert.match(await page.innerText('#bulk-summary'), /1 duplicate skipped/);
    await shot('bulk');
    await page.click('#bulk-import');
    await page.waitForSelector('#card-list');
    log('stats, bulk paste with column mapping and duplicate detection all work');

    await page.goto(URL + '#/listen');
    await page.waitForSelector('#tts-help, #listen-reveal', { timeout: 8000 });
    const hasVoice = (await page.locator('#listen-reveal').count()) > 0;
    await shot('listen');
    log(hasVoice ? 'listening mode found a Japanese voice' : 'listening mode: no Japanese voice here, and it says so with install steps');

    await page.goto(URL + '#/more');
    await page.selectOption('#set-theme', 'light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await shot('more-light');
    await page.selectOption('#set-theme', 'dark');

    // ---- 10. Next day: production direction unlocks ---------------------
    const tomorrow = await context.newPage();
    await tomorrow.clock.install({ time: new Date(Date.now() + 26 * 3600 * 1000) });
    await tomorrow.goto(URL);
    await tomorrow.waitForSelector('#full-start');
    await tomorrow.click('#full-start');
    await tomorrow.waitForSelector('#reveal');
    assert.equal(await tomorrow.getAttribute('.review-body', 'data-direction'), 'production');
    const front = await tomorrow.innerText('.review-body');
    assert.ok(front.includes('to receive (an order) — humble'), 'production prompt shows the English');
    assert.ok(front.includes('＿＿＿') && !front.includes('承'), 'target word is blanked out of the example');
    if (SHOTS) await tomorrow.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-production-front.png`) });
    await tomorrow.click('#reveal');
    assert.ok((await tomorrow.innerText('.review-body')).includes('承'));
    await tomorrow.close();
    log('next day: production card appears (English → Japanese) with the word blanked from its example');

    // ---- 11. Automatic backup into a folder ------------------------------
    // The real folder picker can't be driven headlessly, so it is pointed at a
    // directory in the origin-private file system, which has the same handle API.
    // A persistent profile is used here: headless Chromium's incognito contexts
    // crash when a stored OPFS directory handle is read back from IndexedDB.
    persistent = await chromium.launchPersistentContext(path.join(OUT, 'profile'), {
      viewport: { width: 412, height: 915 },
      acceptDownloads: true,
      locale: 'en-US',
      timezoneId: 'Asia/Tokyo',
    });
    const fsPage = await persistent.newPage();
    fsPage.on('pageerror', (e) => errors.push(String(e)));
    fsPage.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await fsPage.addInitScript(() => {
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true });
    });
    const folderFiles = () =>
      fsPage.evaluate(async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true });
        const out = {};
        for await (const entry of dir.values()) out[entry.name] = JSON.parse(await (await entry.getFile()).text());
        return out;
      });
    // Bring this fresh profile up to date from the first export.
    await fsPage.goto(URL + '#/more');
    await fsPage.setInputFiles('#import-file', first.file);
    await fsPage.waitForSelector('#import-summary');
    await fsPage.click('#confirm-merge');
    await fsPage.waitForSelector('#toast.show:has-text("Merged")');
    await fsPage.fill('#set-deviceLabel', 'e2e phone');
    await fsPage.locator('#set-deviceLabel').blur();
    await fsPage.waitForSelector('#set-autoBackup');
    // A backup from another device is already sitting in the folder, holding a card this device lacks.
    const foreign = JSON.parse(JSON.stringify(first.data));
    foreign.deviceLabel = 'other';
    foreign.cards.push({ ...foreign.cards[0], id: 'aaaaaaaa-0000-4000-8000-000000000001', word: '他端末', reading: 'たたんまつ', srs: undefined, productionUnlockedAt: null });
    await fsPage.evaluate(async (text) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true });
      const w = await (await dir.getFileHandle('goi-backup_2026-01-01_other.json', { create: true })).createWritable();
      await w.write(text);
      await w.close();
    }, JSON.stringify(foreign));

    await fsPage.selectOption('#set-autoBackup', 'folder');
    await fsPage.waitForSelector('#import-summary');
    assert.equal(await fsPage.innerText('#sum-added'), '1');
    assert.deepEqual(Object.keys(await folderFiles()), ['goi-backup_2026-01-01_other.json'], 'nothing written over a folder with unseen data');
    await fsPage.click('#confirm-merge');
    await fsPage.waitForSelector('#toast.show:has-text("Merged")');
    log('folder mode: an existing backup in the chosen folder is offered for import before anything is written');

    await fsPage.waitForSelector('#backup-now');
    await fsPage.click('#backup-now');
    await fsPage.waitForSelector('#last-export:has-text("folder")');
    let files = await folderFiles();
    const autoName = Object.keys(files).find((n) => /^goi-auto_\d{4}-\d{2}-\d{2}_e2e-phone\.json$/.test(n));
    assert.ok(autoName, 'daily file written: ' + Object.keys(files));
    assert.ok(files[autoName].cards.some((c) => c.word === '他端末'));
    const before = files[autoName].cards.length;

    // A change with no further action from the user reaches the file.
    await fsPage.goto(URL + '#/add');
    await fsPage.fill('#f-word', '自動保存');
    await fsPage.fill('#f-reading', 'じどうほぞん');
    await fsPage.click('#save-card');
    await fsPage.waitForSelector('#toast.show');
    await fsPage.click('#tabs a[data-route="home"]');
    await fsPage.waitForSelector('#export-status:has-text("folder")');
    files = await folderFiles();
    assert.equal(files[autoName].cards.length, before + 1, 'new card written to the folder silently');
    assert.ok(files[autoName].cards.some((c) => c.word === '自動保存'));
    assert.equal(Object.keys(files).length, 2, 'same-day backups overwrite one file');
    if (SHOTS) await fsPage.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-home-folder-backup.png`) });
    await fsPage.goto(URL + '#/more');
    await fsPage.waitForSelector('#auto-folder');
    if (SHOTS) await fsPage.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-more-auto-backup.png`) });
    await persistent.close();
    persistent = null;
    log('folder mode: backups are written to the folder silently after changes, one file per day');

    // Browsers without the folder picker (Firefox, Brave) only offer downloads, and say why.
    const noFs = await context.newPage();
    await noFs.addInitScript(() => {
      delete window.showDirectoryPicker;
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
    });
    await noFs.goto(URL + '#/more');
    await noFs.waitForSelector('#folder-unsupported');
    assert.equal(await noFs.locator('#set-autoBackup option[value="folder"]').count(), 0);
    await noFs.close();
    log('without a folder picker the option is hidden and the reason is stated');

    assert.deepEqual(external, [], 'no requests left the origin');
    assert.deepEqual(errors, [], 'no console or page errors');
    log('no network requests outside the app origin; no console errors');
    console.log('\nRun-through passed.');
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, 'FAILURE.png') }).catch(() => {});
    console.error('\nRun-through FAILED:', err);
    if (errors.length) console.error('Page errors:', errors);
    process.exitCode = 1;
  } finally {
    if (persistent) await persistent.close().catch(() => {});
    await browser.close();
    server.kill();
  }
}

main();
