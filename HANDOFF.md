# Handoff — state as of 2026-11-17 (third work block)

For whoever picks this project up next. `CLAUDE.md` has the constraints and the invariants that are easy to break; `README.md` has user-facing behaviour and the JSON schema. This file is the status, the reasoning behind decisions that aren't obvious from the code, what is unverified, and what to do next.

## Where things stand

- **Deployed.** `main` builds and deploys to https://bunt3.github.io/goi-app/ through `.github/workflows/deploy.yml`. Pages source is set to GitHub Actions.
- **Built so far, in order:**
  1. The original brief: FSRS-6 scheduling with caps and overdue spreading, two review directions, quick sessions, JSON export and merge import, Anki TSV, quick add, bulk paste, listening mode, furigana, seed deck, browse, stats.
  2. Automatic backup to a real file (download mode everywhere, folder mode in Chromium).
  3. This block: picking words out of example sentences, and a Capture screen that reads text from photos, screenshots and video frames on the device.
- **Checks:** 96 Vitest tests. `e2e/runthrough.cjs` drives the production build through every feature, including on-device text recognition of rendered images, online and offline.
- **Nothing has been run on a real device by anyone.** This is the largest open risk and it has grown with each block. See "Unverified".

## The owner

Sole user. American, long-term resident of Japan, moving into Japanese-language office work. Passed N1; the gap is written business vocabulary and keigo set phrases. Studies in 5-minute bursts. Devices: Galaxy S24 Ultra (Brave or Chrome), Windows 11 desktop (Firefox, Brave). Wants direct answers with risks stated and sources for factual claims, and prefers that reasonable decisions are made and justified afterwards rather than asked about first.

Standing instruction for this repo: when a build is finished and tests pass, merge into `main` so Pages deploys.

## This block: what was asked and what was built

The owner asked for three things in priority order, describing the second and third as ideas to "toy with".

### 1. Pick a word from an example sentence (done)

- `src/textpick.ts` (pure): `segment` splits text with `Intl.Segmenter('ja')`, with a per-character fallback; `lookup` classifies a selection against the deck as *exact* or *related*; `sentenceAround` finds the sentence to use as the new card's example.
- `src/ui/picker.ts`: `pickerPanel` (tappable text plus a result panel) and `openPickerSheet` (bottom sheet). Used from `cardBack` in `ui/cardview.ts`, so it appears on the answer side in review and in listening mode, and inline on the Capture screen.
- "Related" means the same kanji stem with different okurigana (承り ↔ 承る) or one string being a prefix of the other (稟議 ↔ 稟議書). A single shared kanji inside a different word is deliberately not a match; there are tests for this.
- A new card needs only the word. No reading or meaning sends it to the Inbox, which already existed. Tags come from the parent card minus `seed-unverified`.
- **There is no dictionary**, so the app cannot fill in readings or meanings. This was a constraint of the original brief (no network lookups) and was not revisited. It is the obvious next thing the owner may ask for; see "Next steps".

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
3. **Readings and meanings for picked words.** The app has no dictionary. An offline dictionary (JMdict is the usual source; check its licence terms before bundling) would let the picker prefill reading and meaning and would improve word splitting. It is tens of MB even trimmed, so it would need the same fetch-on-first-use treatment as the OCR files. This changes the product noticeably; confirm with the owner first.
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
