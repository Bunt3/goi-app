/**
 * Headless run-through against the production build:
 *   add card → review → export → clear storage → import → verify restored,
 * plus offline reload and the "replace everything" path.
 *
 *   npm run build:e2e && npm run e2e
 *
 * build:e2e builds with the small test dictionary (tests/fixtures/dict-sample.json).
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
  if (!fs.existsSync(path.join(ROOT, 'dist/dict/manifest.json'))) {
    console.error('dist/ has no dictionary. Build with the test fixture first: npm run build:e2e');
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, acceptDownloads: true, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // The OCR engine prints harmless model-config warnings on the error channel.
  const isNoise = (t) => t.startsWith('Warning: Parameter not found');
  page.on('console', (m) => m.type() === 'error' && !isNoise(m.text()) && errors.push(m.text()));
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
    assert.equal(first.data.schemaVersion, 2);
    assert.ok(first.data.cards.every((c) => c.deck === ''), 'cards added by hand are in the default deck');
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
    for (const [id, deck] of [['slang', 'Modern slang'], ['office', 'Office slang'], ['onomatopoeia', '擬音語・擬態語']]) {
      await page.click(`#load-pack-${id}`);
      await page.waitForSelector(`#pack-result-${id}:has-text("Added")`);
      assert.match(await page.innerText(`#pack-result-${id}`), new RegExp(`^Added \\d+ cards to ${deck}`));
    }
    await page.goto(URL + '#/browse?filter=all&deck=' + encodeURIComponent('Modern slang'));
    await page.waitForSelector('#card-list .item');
    assert.ok((await page.locator('#card-list .item').count()) >= 60, 'slang deck loaded');
    await page.goto(URL + '#/home');
    await page.waitForSelector('#deck-bar [data-deck="擬音語・擬態語"]');
    log('starter decks: slang, office slang and onomatopoeia each load into their own deck, offered on Today');
    await page.goto(URL + '#/browse?filter=all&deck=*');
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

    // Pick an unknown word out of the example sentence without leaving the review.
    const deckSize = async () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const c = r.result.transaction('cards').objectStore('cards').count(); c.onsuccess = () => { r.result.close(); res(c.result); }; }; }));
    const sizeBefore = await deckSize();
    await page.click('#pick-open');
    await page.waitForSelector('.sheet .tok');
    const picked = await page.locator('.sheet .tok:not(.known)').first().innerText();
    await page.locator('.sheet .tok:not(.known)').first().click();
    await page.waitForSelector('#pick-status:has-text("not in your deck")');
    assert.equal(await page.inputValue('#pick-word'), picked);
    assert.equal(await page.innerText('#pick-add'), 'Add to Inbox');
    await page.fill('#pick-reading', 'てすと');
    await page.fill('#pick-meaning', 'picked from a sentence');
    assert.equal(await page.innerText('#pick-add'), 'Add to deck');
    await shot('picker-sheet');
    await page.click('#pick-add');
    await page.waitForSelector('#pick-status:has-text("already in your deck")');
    assert.equal(await deckSize(), sizeBefore + 1);
    // Number keys must not rate the card underneath while the sheet is open.
    await page.keyboard.press('3');
    assert.equal(await page.locator('.sheet').count(), 1);
    assert.equal(await page.locator('.ratings').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sheet').count(), 0);
    assert.equal(await page.locator('.ratings').count(), 1, 'still on the same card after closing the picker');
    log(`word picker: “${picked}” reported as new, added mid-review, then reported as already in the deck`);

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

    // ---- 9b. Capture: paste text, read an image, read a video frame -----
    await page.goto(URL + '#/capture');
    await page.fill('#capture-text', '平素より大変お世話になっております。\n稟議を上げる前に、齟齬がないかご確認ください。');
    await page.waitForSelector('#capture-pick .tok');
    const known = page.locator('#capture-pick .tok.known', { hasText: '稟議' });
    assert.equal(await known.count(), 1, 'a word already in the deck is marked in the text');
    await known.click();
    await page.waitForSelector('#pick-status:has-text("already in your deck")');
    await known.click(); // clear
    await page.fill('#capture-source', 'e2e email');
    await page.locator('#capture-source').blur();
    const firstTok = page.locator('#capture-pick .tok:not(.known)').first();
    const firstText = await firstTok.innerText();
    await firstTok.click();
    await page.waitForSelector('#pick-status:has-text("not in your deck")');
    await page.click('#pick-add'); // word only → Inbox
    await page.waitForSelector('#pick-status:has-text("already in your deck")');
    const captured = await page.evaluate((w) => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const q = r.result.transaction('cards').objectStore('cards').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.find((c) => c.word === w && !c.deleted)); }; }; }), firstText);
    assert.equal(captured.example_ja, '平素より大変お世話になっております。', 'the sentence it came from becomes the example');
    assert.equal(captured.source, 'e2e email');
    assert.equal(captured.reading, '');
    await shot('capture-text');
    log(`capture from pasted text: “${firstText}” added with its sentence as the example and the source filled in`);

    // Render Japanese text to PNGs (light and dark) and read them back on-device.
    const truth = ['資料を添付いたしますので', 'ご査収ください', '納期について懸念があります'];
    const makeImage = async (name, dark) => {
      const p2 = await context.newPage();
      await p2.setViewportSize({ width: 900, height: 360 });
      await p2.setContent(`<body style="margin:0;padding:36px;background:${dark ? '#15181c' : '#fff'};color:${dark ? '#eee' : '#111'};font:38px/1.9 IPAGothic,sans-serif">${truth[0]}、${truth[1]}。<br>${truth[2]}。</body>`);
      const file = path.join(OUT, name);
      await p2.screenshot({ path: file });
      await p2.close();
      return file;
    };
    const accuracy = (got) => {
      const want = [...truth.join('')];
      const have = got.replace(/\s/g, '');
      return want.filter((ch) => have.includes(ch)).length / want.length;
    };
    const readImage = async (file) => {
      await page.fill('#capture-text', '');
      await page.setInputFiles('#capture-image', file);
      await page.waitForSelector('#crop-frame');
      const t0 = Date.now();
      await page.click('#ocr-read');
      await page.waitForFunction(() => document.querySelector('#capture-text').value.trim() !== '', null, { timeout: 180000 });
      return { text: await page.inputValue('#capture-text'), ms: Date.now() - t0 };
    };
    const light = await readImage(await makeImage('ocr-light.png', false));
    await shot('capture-ocr');
    assert.ok(accuracy(light.text) > 0.8, 'light image read poorly: ' + light.text);
    assert.ok(!/[\u3040-\u9fff] [\u3040-\u9fff]/.test(light.text), 'OCR spacing between Japanese characters removed');
    await page.waitForSelector('#capture-pick .tok');
    log(`on-device OCR, dark text on white: ${Math.round(accuracy(light.text) * 100)}% of expected characters found, ${light.ms} ms incl. first load → ${JSON.stringify(light.text)}`);
    const dark = await readImage(await makeImage('ocr-dark.png', true));
    assert.ok(accuracy(dark.text) > 0.8, 'dark image read poorly: ' + dark.text);
    log(`on-device OCR, light text on dark: ${Math.round(accuracy(dark.text) * 100)}% of expected characters found, ${dark.ms} ms`);

    // A region dragged on the image limits what is read.
    await page.fill('#capture-text', '');
    await page.locator('#crop-frame').scrollIntoViewIfNeeded();
    await page.waitForTimeout(700); // let the smooth scroll after the last read settle
    const frameBox = await page.locator('#crop-frame').boundingBox();
    // The second line of text sits roughly 35–55% of the way down the image.
    await page.mouse.move(frameBox.x + 4, frameBox.y + frameBox.height * 0.38);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + frameBox.width - 4, frameBox.y + frameBox.height * 0.54, { steps: 4 });
    await page.mouse.up();
    assert.equal(await page.innerText('#ocr-read'), 'Read selected part');
    await page.click('#ocr-read');
    await page.waitForFunction(() => document.querySelector('#capture-text').value.trim() !== '', null, { timeout: 60000 });
    const part = await page.inputValue('#capture-text');
    assert.ok(part.includes('懸念') && !part.includes('添付'), 'only the selected line was read: ' + part);
    log('dragging a box on the image reads only that region');

    // Video: record a short clip showing the same text, load it, grab a frame, read it.
    const videoB64 = await page.evaluate(async (lines) => {
      if (typeof MediaRecorder === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 900; c.height = 300;
      const g = c.getContext('2d');
      const draw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 300); g.fillStyle = '#111'; g.font = '40px IPAGothic, sans-serif'; lines.forEach((l, i) => g.fillText(l, 30, 90 + i * 80)); };
      draw();
      const type = ['video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type) return null;
      const rec = new MediaRecorder(c.captureStream(15), { mimeType: type });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      rec.start();
      const timer = setInterval(draw, 60);
      await new Promise((r) => setTimeout(r, 1200));
      clearInterval(timer);
      rec.stop();
      await done;
      const buf = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
      let bin = '';
      for (const b of buf) bin += String.fromCharCode(b);
      return btoa(bin);
    }, [truth[0], truth[2]]);
    if (videoB64) {
      const videoFile = path.join(OUT, 'clip.webm');
      fs.writeFileSync(videoFile, Buffer.from(videoB64, 'base64'));
      await page.fill('#capture-text', '');
      await page.setInputFiles('#capture-video-file', videoFile);
      await page.waitForSelector('#capture-video');
      await page.waitForFunction(() => document.querySelector('#capture-video').readyState >= 2, null, { timeout: 15000 });
      await page.click('#video-grab');
      await page.waitForSelector('#crop-frame');
      await page.click('#ocr-read');
      await page.waitForFunction(() => document.querySelector('#capture-text').value.trim() !== '', null, { timeout: 60000 });
      const fromVideo = await page.inputValue('#capture-text');
      assert.ok(fromVideo.includes('懸念') || fromVideo.includes('添付'), 'video frame read: ' + fromVideo);
      await shot('capture-video');
      log(`video: frame grabbed from a clip and read → ${JSON.stringify(fromVideo)}`);
    } else {
      log('video: SKIPPED (this browser build cannot record a test clip)');
    }

    // Once used, the reader works with no connection (its files are kept by the service worker).
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#btn-image');
    const offline = await readImage(path.join(OUT, 'ocr-light.png'));
    await context.setOffline(false);
    assert.ok(accuracy(offline.text) > 0.8, 'offline read: ' + offline.text);
    log(`on-device OCR works offline after first use (${offline.ms} ms including reloading the engine)`);

    // ---- 9c. Offline dictionary (built from the test fixture) -------------
    const cardByWord = (w) => page.evaluate((w) => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const q = r.result.transaction('cards').objectStore('cards').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.find((c) => c.word === w && !c.deleted)); }; }; }), w);
    // A build without dictionary data says so instead of failing.
    const noDict = await context.newPage();
    await noDict.route('**/dict/manifest.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
    await noDict.goto(URL + '#/more?focus=dict');
    await noDict.waitForSelector('#dict-status:has-text("not available in this build")');
    await noDict.close();
    log('a build without dictionary data says “not available in this build”');

    // Nothing is downloaded until asked; the picker points to the download.
    await page.goto(URL + '#/capture');
    await page.fill('#capture-text', '担当の者に取り次ぎますので、少々お待ちください。');
    await page.waitForSelector('#capture-pick .tok');
    await page.locator('#capture-pick .tok:not(.known)').first().click();
    await page.waitForSelector('#pick-status:has-text("not in your deck")');
    await page.waitForSelector('#pick-dict a[href="#/more?focus=dict"]');
    await page.goto(URL + '#/more?focus=dict');
    await page.waitForSelector('#dict-install');
    assert.match(await page.innerText('#dict-status'), /Not downloaded\. About .* MB to download, 51 entries/);
    await shot('dict-offer');
    await page.click('#dict-install');
    await page.waitForSelector('#dict-status:has-text("Installed: 51 entries")', { timeout: 30000 });
    assert.equal(await page.locator('#dict-panel .notice:has-text("test dictionary")').count(), 1, 'the fixture build says it is not the real dictionary');
    await shot('dict-installed');
    log('dictionary downloads only when asked, installs in a worker, and the fixture build is labelled as such');

    // Pick a conjugated verb out of a sentence: dictionary form, reading and meaning are filled; the sentence stays the example.
    const pickConjugated = async (label) => {
      await page.goto(URL + '#/capture');
      await page.fill('#capture-text', '昨日、お客様にメールを書きました。');
      await page.fill('#capture-source', 'e2e dictionary');
      await page.locator('#capture-source').blur();
      await page.click('#capture-pick .picker .link'); // pick by character
      await page.locator('#capture-pick .tok', { hasText: '書' }).first().click();
      await page.locator('#capture-pick .tok', { hasText: 'た' }).first().click();
      await page.waitForSelector('#pick-status:has-text("書きました")');
      await page.waitForSelector('#pick-dict .dict-cand.on');
      assert.equal(await page.inputValue('#pick-word'), '書く', label + ': dictionary form');
      assert.equal(await page.inputValue('#pick-reading'), 'かく', label + ': reading');
      assert.match(await page.inputValue('#pick-meaning'), /to write/, label + ': meaning');
      assert.equal(await page.innerText('#pick-add'), 'Add to deck');
      if (label === 'offline') assert.equal(await page.locator('#pick-dict:has-text("書く is already in your deck")').count(), 1);
    };
    await pickConjugated('online');
    await shot('dict-pick');
    await page.click('#pick-add');
    await page.waitForSelector('#pick-status:has-text("Added")');
    const kaku = await cardByWord('書く');
    assert.equal(kaku.reading, 'かく');
    assert.equal(kaku.example_ja, '昨日、お客様にメールを書きました。', 'the picked sentence is the example, not a corpus one');
    assert.ok(kaku.tags.includes('auto-filled'), 'auto-filled tag: ' + kaku.tags);
    assert.equal(kaku.source, 'e2e dictionary');
    log('picking 書きました from a sentence fills 書く, かく and its meaning, keeps the sentence, tags it auto-filled');

    // Type slang on the Add screen: found as typed, so it fills at once, with its tags, register and a corpus example.
    await page.goto(URL + '#/add');
    await page.fill('#f-word', 'ヤバい');
    await page.waitForSelector('#f-dict .dict-cand.on');
    assert.equal(await page.inputValue('#f-reading'), 'ヤバい');
    await shot('dict-add-slang');
    await page.click('#save-card');
    await page.waitForSelector('#toast.show:has-text("Saved ヤバい.")');
    const yabai = await cardByWord('ヤバい');
    assert.deepEqual([...yabai.tags].sort(), ['auto-filled', 'colloquial', 'slang']);
    assert.equal(yabai.register, 'casual');
    assert.match(yabai.meaning_en, /dangerous/);
    assert.equal(yabai.example_ja, 'このラーメン、ヤバい！', 'a dictionary example fills an empty example');
    // A conjugated form is offered, not filled, until tapped.
    await page.fill('#f-word', 'ググった');
    await page.waitForSelector('#f-dict .dict-cand');
    assert.equal(await page.inputValue('#f-reading'), '', 'nothing filled before a choice');
    await page.click('#f-dict .dict-cand');
    assert.equal(await page.inputValue('#f-word'), 'ググる');
    assert.equal(await page.inputValue('#f-reading'), 'ググる');
    // A reading typed by hand is never replaced.
    await page.fill('#f-word', '');
    await page.fill('#f-reading', 'てがき');
    await page.fill('#f-word', '確認');
    await page.waitForSelector('#f-dict .dict-cand.on');
    assert.equal(await page.inputValue('#f-reading'), 'てがき', 'typed reading kept');
    await page.fill('#f-word', '');
    await page.fill('#f-reading', '');
    log('Add screen: slang fills with slang/colloquial tags and casual register; conjugated forms wait for a tap; typed fields are kept');

    // Work through the Inbox one card at a time.
    await page.goto(URL + '#/browse?filter=inbox');
    await page.click('#inbox-walk');
    await page.waitForSelector('#f-dict .dict-cand');
    assert.equal(await page.inputValue('#f-word'), '按分');
    assert.equal(await page.inputValue('#f-reading'), 'あんぶん', 'the reading already on the card is kept');
    assert.match(await page.inputValue('#f-meaning-en'), /proportional division/);
    await shot('dict-inbox');
    await page.click('#save-card');
    await page.waitForSelector('#toast.show:has-text("Saved.")');
    // The seed deck has its own 按分 card; the Inbox one is the one without the seed tag.
    const anbun = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const q = r.result.transaction('cards').objectStore('cards').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.find((c) => c.word === '按分' && !c.deleted && !c.tags.includes('seed-unverified'))); }; }; }));
    assert.match(anbun.meaning_en, /proportional division/);
    assert.ok(anbun.tags.includes('auto-filled'));
    log('Inbox: “Fill in one at a time” shows the dictionary’s candidate for each card and moves on after Save');

    // Browse the dictionary by label, add a word to a new deck, and study that deck alone.
    await page.goto(URL + '#/dict');
    await page.click('#dict-labels [data-label="sl"]');
    await page.waitForSelector('#dict-count:has-text("3 entries labelled Slang")');
    await page.locator('#dict-results .dict-row', { hasText: 'キモい' }).click();
    await page.waitForSelector('#dict-detail #dict-add');
    await page.selectOption('#dict-deck', { label: 'New deck…' });
    await page.fill('#dict-deck-new', 'Slang');
    await shot('dict-browse');
    await page.click('#dict-add');
    await page.waitForSelector('#toast.show:has-text("Added キモい to Slang.")');
    await page.waitForSelector('#dict-results .dict-item:has-text("キモい") .badge.accent');
    const kimoi = await cardByWord('キモい');
    assert.equal(kimoi.deck, 'Slang');
    assert.ok(kimoi.tags.includes('slang') && kimoi.tags.includes('auto-filled'), 'tags: ' + kimoi.tags);
    await page.fill('#dict-q', 'proportional');
    await page.waitForSelector('#dict-results .dict-item:has-text("按分")');
    await page.fill('#dict-q', '書きました');
    await page.waitForSelector('#dict-results .dict-item:has-text("書く")');
    log('dictionary screen: browse by label, search by English or a conjugated form, add an entry into a new deck');

    await page.goto(URL + '#/home');
    await page.waitForSelector('#deck-bar [data-deck="Slang"]');
    const allNew = Number(await page.innerText('#count-new'));
    await page.click('#deck-bar [data-deck="Slang"]');
    await page.waitForSelector('#deck-bar [data-deck="Slang"].on');
    assert.equal(await page.innerText('#count-new'), '1', 'only the Slang deck is queued');
    await shot('home-decks');
    await page.click('#deck-bar [data-deck="*"]');
    await page.waitForSelector('#deck-bar [data-deck="*"].on');
    assert.equal(Number(await page.innerText('#count-new')), allNew);
    await page.goto(URL + '#/browse?filter=all&deck=Slang');
    await page.waitForSelector('#card-list .item');
    assert.equal(await page.locator('#card-list .item').count(), 1);
    log(`decks: Today studies only the chosen decks (Slang: 1 new vs ${allNew} for all); Browse filters by deck`);

    // Offline: the dictionary is local.
    await context.setOffline(true);
    await page.reload();
    await pickConjugated('offline');
    await page.goto(URL + '#/more?focus=dict');
    await page.waitForSelector('#dict-status:has-text("Installed")');
    await context.setOffline(false);
    log('dictionary lookups work offline');

    // Removing it leaves the deck alone.
    const cardsBefore = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const q = r.result.transaction('cards').objectStore('cards').count(); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }));
    await page.click('#dict-remove');
    await page.waitForSelector('#dict-install');
    const cardsAfter = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('goi-app'); r.onsuccess = () => { const q = r.result.transaction('cards').objectStore('cards').count(); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }));
    assert.equal(cardsAfter, cardsBefore);
    const left = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('goi-dict'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('entries')) { db.close(); res(0); return; } const q = db.transaction('entries').objectStore('entries').count(); q.onsuccess = () => { db.close(); res(q.result); }; }; }));
    assert.equal(left, 0, 'dictionary entries deleted');
    log('removing the dictionary deletes its database and leaves the cards alone');

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
