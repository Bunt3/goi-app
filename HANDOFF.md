# Handoff — state as of 2026-11-17 (after the fourth work block: offline dictionary)

For whoever picks this project up next. `CLAUDE.md` has the constraints and the invariants that are easy to break; `README.md` has user-facing behaviour and the JSON schema. This file is the status, the reasoning behind decisions that aren't obvious from the code, what is unverified, and what to do next.

## Where things stand

- **Deployed.** `main` builds and deploys to https://bunt3.github.io/goi-app/ through `.github/workflows/deploy.yml`. Pages source is set to GitHub Actions.
- **Built so far, in order:**
  1. The original brief: FSRS-6 scheduling with caps and overdue spreading, two review directions, quick sessions, JSON export and merge import, Anki TSV, quick add, bulk paste, listening mode, furigana, seed deck, browse, stats.
  2. Automatic backup to a real file (download mode everywhere, folder mode in Chromium).
  3. Picking words out of example sentences, and a Capture screen that reads text from photos, screenshots and video frames on the device.
  4. This block: an offline dictionary (JMdict) that fills readings, meanings, tags and examples. See below.
- **Checks:** 168 Vitest tests. `e2e/runthrough.cjs` drives the production build through every feature, including on-device text recognition of rendered images, online and offline.
- **Nothing has been run on a real device by anyone.** This is the largest open risk and it has grown with each block. See "Unverified".

## NEXT TASK

The offline dictionary (previous NEXT TASK) is built: phases A to D are done and shipped; phase E (dictionary-based word splitting) was not done. What remains, in order:

1. **Owner tries it on the phone.** Install the dictionary from More on Wi-Fi, then: pick words from real example sentences, type slang into Add, walk the Inbox. Report wrong first candidates and misses with the exact text. Nothing has been checked against real JMdict data on a real sentence.
2. **Check the CI-built file.** See "Dictionary: real data" below for what the first CI run showed. If the example-sentence count is 0 there, the key names in the examples file differ from what `examplePair` in `scripts/build-dict.mjs` accepts (`sentences[].land` or `.lang`, values `jpn`/`eng`); inspect one entry and adjust.
3. **Verify the licence wording.** The EDRDG licence page and Tatoeba's terms could not be fetched from the build container. The More screen and README avoid naming a licence version; confirm the attribution wording on https://www.edrdg.org/edrdg/licence.html and add the version if wanted.
4. **Phase E, optional:** split picker text by longest dictionary match instead of `Intl.Segmenter`. Needs a batched lookup of all prefixes at each position (one IndexedDB query per position), so test speed on the phone first.

## Offline dictionary: what was built (this block)

The owner asked for an offline dictionary that fills definitions and example sentences when a card is created, with casual, colloquial and slang vocabulary as important as N1 and business vocabulary, decisions made and justified afterwards. Design and order of work followed the plan written in the previous block.

- **Data:** JMdict via jmdict-simplified's English file with examples (`jmdict-examples-eng-*.json.zip`; falls back to `jmdict-eng-*`). Verified on 2026-11-17 from GitHub's release page: tag `3.6.2+20261116213322`, examples file 13.5 MB zipped, plain English 11 MB; word JSON shape confirmed from the project's TypeScript types (`kanji`, `kana[].appliesToKanji` with `"*"`, `sense[].partOfSpeech/misc/field/dialect/gloss`). The examples variant's keys are not in those types; the parser accepts both `land` and `lang`.
- **Build:** `scripts/build-dict.mjs` compacts each word to short keys (`src/dict/entry.ts`), one JSON per line, gzipped, plus `manifest.json`, into `public/dict/`. Budget 15 MB gzip (`DICT_MAX_MB`); over budget it drops examples to one per sense, then none, never words. CI (`deploy.yml`) asks the GitHub API for the latest release, caches the zip with `actions/cache` keyed on the asset name, and builds with `DICT_OPTIONAL=1`; every dictionary step is `continue-on-error`.
- **Device:** separate Dexie database `goi-dict` (`src/dictdb.ts`), indexes `*k` and `*r`. Installed only from More → Dictionary, by a module worker that streams, un-gzips (`DecompressionStream`, or not if the server already did) and bulk-inserts 2000 at a time. Marked complete only at the end; an interrupted install is detected and offered again. Not cached by the service worker (the database is the copy). Remove deletes the database.
- **Lookup:** `src/dict/deinflect.ts` is a suffix-rule table written for this app (about 330 rules, generated from per-class rows: godan, ichidan, する, 来る, i-adjectives, te-form auxiliaries, casual contractions ちゃう/てる/とく/ねえ/ん/ら抜き, お〜ください, honorific prefix stripping). Each rule has an input and output word class, so 〜ない chains like an adjective and 〜ている like an ichidan verb. A deinflected candidate counts only if the entry's part of speech fits, which separates homographs (きった → 切る, never 着る). Ranking: exact before deinflected, common before rare, kana-usual entries for kana input, shorter chains first.
- **Where it plugs in:** picker (and so Capture), Add, and the Inbox walk-through (Cards → Inbox → "Fill in one at a time", Save, next / Skip). `AutoFill` in `src/ui/dict.ts` writes only empty fields or fields it filled itself; the IME reading counts as automatic, so the dictionary replaces it. The picker keeps the picked sentence as the example; Add and Inbox use a dictionary example only when the example is empty. Cards keeping dictionary values get `auto-filled` plus mapped tags (`slang`, `internet slang`, `colloquial`, `vulgar`, `derogatory`, `archaic`, `dialect`, `関西弁`, `ビジネス`, `IT`, `法律`, `経済`) and a register (hon/hum/pol/casual/form). `Register` was not extended, so no schema change.
- **Decisions made without asking:**
  - Add fills automatically only when the typed word is found exactly; a conjugated form or other spelling waits for a tap. Typing 買った should not silently become 買う with a meaning the owner didn't choose.
  - The picker auto-applies the first candidate (the selection is from text, so replacing it with the dictionary form is the point), with the others one tap away.
  - The word keeps the script it was written in (ヤバい stays katakana; its reading is ヤバい). Changing the owner's spelling to JMdict's headword would lose information.
  - `bus` maps to a new `ビジネス` tag, not `会議`. `comp` maps to the existing `IT` tag.
  - `archaic` only from the first sense; a common word with one old sense further down is not archaic.
  - The Edit screen looks up only Inbox cards. A complete card's fields are all the owner's, so a lookup could fill nothing.

### Dictionary: real data

Not yet seen. The first CI run with this code fetches and builds it; record here the asset name, entry and example counts, raw and gzip size printed by `build-dict.mjs` in the "npm run build" step of the Actions log.

Scale check done here with a synthetic 210,000-entry file (fixture entries repeated, so shorter than real ones): build 4 s; in headless Chromium with the CPU slowed 4×, install 18 s, 77 MB of storage, first lookup well under a second. Real entries are longer, so expect roughly 2–3× the install time and storage. Unmeasured on a phone.

### Dictionary limits to tell the owner

- Slang coverage is good for established slang and lags current usage. Entries are labelled, but there is no frequency information for slang.
- The first candidate is a guess for homographs; `auto-filled` marks every card to check.
- Corpus example sentences are of mixed quality and missing for many business and slang terms; examples cannot be generated without an AI model, which the constraints exclude.
- Deinflection covers standard and common casual forms, not classical or rare ones.

## The owner

Sole user. American, long-term resident of Japan, moving into Japanese-language office work. Passed N1; the gap is written business vocabulary and keigo set phrases. Studies in 5-minute bursts. Devices: Galaxy S24 Ultra (Brave or Chrome), Windows 11 desktop (Firefox, Brave). Wants direct answers with risks stated and sources for factual claims, and prefers that reasonable decisions are made and justified afterwards rather than asked about first.

Standing instruction for this repo: when a build is finished and tests pass, merge into `main` so Pages deploys.

## Third block: what was asked and what was built

The owner asked for three things in priority order, describing the second and third as ideas to "toy with".

### 1. Pick a word from an example sentence (done)

- `src/textpick.ts` (pure): `segment` splits text with `Intl.Segmenter('ja')`, with a per-character fallback; `lookup` classifies a selection against the deck as *exact* or *related*; `sentenceAround` finds the sentence to use as the new card's example.
- `src/ui/picker.ts`: `pickerPanel` (tappable text plus a result panel) and `openPickerSheet` (bottom sheet). Used from `cardBack` in `ui/cardview.ts`, so it appears on the answer side in review and in listening mode, and inline on the Capture screen.
- "Related" means the same kanji stem with different okurigana (承り ↔ 承る) or one string being a prefix of the other (稟議 ↔ 稟議書). A single shared kanji inside a different word is deliberately not a match; there are tests for this.
- A new card needs only the word. No reading or meaning sends it to the Inbox, which already existed. Tags come from the parent card minus `seed-unverified`.
- The dictionary added in the fourth block fills readings and meanings here when installed.

### 2. Image input (done, with real limits)

- `src/ui/capture.ts` at `#/capture`, reached from the Add screen. Inputs: camera (`<input capture>`, so no camera permission in the page), image file, drag and drop, clipboard paste of a screenshot, and typed or pasted text.
- `src/ocr.ts` wraps `tesseract.js` 7 with the `jpn` `4.0.0_best_int` model. The engine and model are copied from `node_modules` to `public/ocr/` by `scripts/copy-ocr.cjs` (runs before `dev` and `build`; the folder is git-ignored) and served from the app's own origin. They are fetched on first use, about 5 MB over the wire, and held in a separate service-worker cache that survives app updates.
- **This added the third runtime dependency.** The original brief said minimal dependencies and listed OCR as out of scope; the owner then asked for OCR, and there is no browser-native way to do it. The library is loaded only when an image is read.
- `prepareForOcr` does four things, each found necessary by testing: widen a hand-drawn box by 20% of its height; upscale small regions; add a 30 px or larger border in the background colour; invert dark images. The border matters most: a legible one-line crop with text 5 px from the edge came back as garbage and read perfectly once bordered.
- The text box is editable because recognition makes mistakes. Everything downstream works from the text box, so pasted text and corrected text behave the same as recognised text.

### 3. Video (done in the simplest useful form)

- Load a video file, pause on the frame with the text, *Use this frame*; the frame becomes an image and goes through the same path. No automatic scanning of a clip.
- Chosen because sampling every frame through the recogniser is slow on a phone and produces duplicate, half-legible text, while the user already knows which frame they want.

### Audio (deliberately not built)

The owner mentioned audio alongside visuals. In-app speech recognition was not added: the browser API sends audio to a server by default ([MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)), which the no-network rule excludes, and it is not usable in Firefox or Brave. The Capture text box accepts dictation from the keyboard's microphone (Gboard, Samsung voice input, Win+H), and the UI says so. An on-device option exists in recent Chromium (`processLocally`) but was not investigated; an offline model such as Whisper in WebAssembly would be tens to hundreds of MB.

## Earlier decisions and why

### Storage and backup

- **IndexedDB stays the working store.** A file-based primary store needs the File System Access API, which Firefox lacks and Brave disables ([brave-browser#11407](https://github.com/brave/brave-browser/issues/11407)). Chrome on Android has it without atomic writes ([Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c)). The origin-private file system is cleared together with IndexedDB, so it adds no durability.
- **Automatic backup** (`Settings.autoBackup`): `download` (default) saves `goi-auto_DATE_LABEL.json` at session end, at most once per study day; `folder` writes silently into a chosen folder, debounced 20 s after any change, on `visibilitychange → hidden`, at session end and on opening Today, keeping the newest 14 daily files.
- **Safeguards:** an empty deck is never backed up; a chosen folder holding data this device lacks triggers the import summary before any write; rotation deletes only this device's `goi-auto_*` files; a failed folder write at session end falls back to a download; settings are updated only after the write succeeds (`store.prepareBackup` → `commit`).
- "Anything new to back up" is a fingerprint (`deckMark`) compared with `Settings.lastBackupMark`. `lastExportAt` means "last backup of any kind".

### Scheduling

- **Overdue spreading is stateless.** Each day takes the due reviews with the lowest retrievability up to the cap; nothing is rescheduled. A backlog smaller than the cap arrives in one day.
- New cards pause while due reviews exceed the cap (`pauseNewDuringBacklog`).
- The new-card cap counts each direction. At 8 per day, steady state is about 4 new words plus 4 production cards.
- Production unlocks when recognition first reaches the review state with a pass, and is offered from the next study day, ahead of brand-new words.
- One direction per card per day.
- ts-fsrs default learning steps (1 m, 10 m; relearning 10 m) with a 20-minute learn-ahead.

### Merge

- Text follows the newer `updated`. Progress is merged per direction from review logs: superset wins, divergence is replayed through FSRS. This deliberately departs from the brief's literal wording for scheduling state.
- Settings are per device and never merged.

### UI

- English interface, Japanese content, `<html lang="ja">` for correct glyph forms.
- Furigana on the target word inside the example; on the headword only when there is no example; never on the recognition prompt.
- Toasts at the top, away from the thumb-zone buttons.
- Five bottom tabs. Capture and bulk paste hang off Add rather than taking a tab.

## Unverified

Ordered by how likely they are to bite.

0. **The dictionary on real data and real text.** Only the 49-entry fixture and a synthetic 210,000-entry file were run here. Ranking, deinflection coverage, example-sentence parsing, install time and storage on the phone are all unverified. See "NEXT TASK".
1. **Text recognition on real input.** Tested only on text rendered by headless Chromium in one font, on plain light and dark backgrounds. Not tested: any real photograph, a phone camera, a screenshot from another application, mixed Japanese and Latin layouts, small text. One stray extra kana appeared even in the clean test. Expect materially worse results on photos. Vertical text is unsupported (no `jpn_vert` model shipped).
2. **Recognition speed and memory on the phone.** Sub-second in the build container. A phone will be slower and the engine holds tens of MB; `disposeOcr` runs when leaving the Capture screen.
3. **Word splitting quality.** `Intl.Segmenter` output depends on the browser's ICU version. Tests assert only properties that should hold everywhere. The user-facing escape hatch is *Pick by character*.
4. **Real devices generally.** No run on the S24, in Brave, or in Firefox: PWA install, safe-area insets, the bottom sheet over the on-screen keyboard, `<input capture>` behaviour, drag-to-select on a touch screen, downloads on Android.
5. **Video formats.** The run-through uses a WebM clip it records itself. Phone recordings are usually MP4/H.264 or HEVC; whether the browser plays them is untested, and HEVC often fails in Chromium.
6. **Folder backup against a real folder.** Tested with the picker pointed at the origin-private file system only.
7. **Audio output.** No Japanese voice in the build environment; only the "no voice" path was exercised.
8. **Seed deck content.** 182 cards written without a dictionary check, all tagged `seed-unverified`.
9. **Brave's File System Access flag** on Windows: reported to exist, not verified, not promised in the README.

## Suggested next steps, in order

1. **Real-device pass by the owner**, focused on the new work: the word picker sheet with the keyboard open; Capture with a real screenshot and a real photo; a phone video. Ask for the actual recognised text versus the truth. Everything below depends on what this shows.
2. **If recognition is too weak on photos** (likely), options in rising cost:
   - Lean on the device: the owner copies text from the phone's or Windows' own recogniser and pastes. Already supported; may be the honest answer.
   - Add `jpn_vert` and a vertical toggle (about 2 MB more, same engine).
   - Add contrast normalisation or thresholding in `prepareForOcr`, and try page-segmentation mode 6 for hand-drawn boxes. Plain tests showed no difference between modes 3, 6 and 7 on clean text.
   - Replace the engine with a detection-plus-recognition model run through ONNX Runtime Web (for example PaddleOCR's Japanese models). Noticeably better on photos, but roughly 10–25 MB of model and runtime and a larger integration. Only worth it if the owner uses photo capture often.
3. **The offline dictionary's follow-ups.** See "NEXT TASK" at the top.
4. **Automatic video scanning**, if wanted after trying the frame-grab flow: sample a frame every second or two, skip frames that barely differ from the last, recognise, de-duplicate lines.
5. Confirm two earlier behaviours the owner has not explicitly accepted: each direction counting against the new-card cap, and a sub-cap backlog arriving in one day.
6. Seed deck review. Editing meanings or examples in `src/data/seed.ts` is safe; changing a `word` or `reading` changes the card id (see `CLAUDE.md`).
7. Smaller ideas, none requested: a local snapshot before Merge or Replace so a bad import can be undone; marking picked words in the sentence after they are added; excluding lone particles from the tappable pieces; running the run-through in CI; fixing the dark flash on load for light-theme users.

## Environment notes for cloud sessions

- **`git push` returned 403 on the first attempts** in the first block, then succeeded after the branch had been created through the GitHub API. If a push is refused, try creating the branch with the GitHub tools and pushing again before concluding access is missing. Later pushes worked directly.
- **`bunt3.github.io` is not reachable from the build container.** Confirm deploys by reading the Actions run.
- **Headless Chromium's default (incognito) contexts crash** when a stored OPFS directory handle is read back from IndexedDB. The folder-backup part of the run-through uses `launchPersistentContext`.
- **The run-through generates its own test media**: PNGs by screenshotting a page of Japanese text, and a WebM clip with `MediaRecorder`. It needs a Japanese font on the machine (IPAGothic here). If recording is unavailable it logs the video step as skipped rather than failing.
- **The OCR engine writes harmless "Parameter not found" warnings to the console's error channel.** The run-through filters exactly that prefix; do not widen the filter.
- `vite preview` sends `Vary: Origin`; the service worker uses `ignoreVary` so cached files still match.
- npm resolved `ts-fsrs` to 5.4.2 (FSRS-6); the code targets the 5.x API.
- `public/ocr/` is generated. After a fresh clone, `npm run build` or `npm run dev` recreates it; running `vite` directly without it leaves Capture unable to read images.
