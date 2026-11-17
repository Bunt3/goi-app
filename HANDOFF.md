# Handoff — state as of 2026-11-17

For whoever picks this project up next. `CLAUDE.md` has the constraints and invariants; `README.md` has user-facing behaviour and the schema. This file is the status, the reasoning behind decisions that aren't obvious from the code, and what is still open.

## Where things stand

- **Deployed.** `main` builds and deploys to https://bunt3.github.io/goi-app/ through `.github/workflows/deploy.yml`. Pages source is already set to GitHub Actions.
- **Feature-complete against the original brief** (P1 core, P2 input and listening, P3 content and polish), plus automatic backup added afterwards.
- **Checks:** 81 Vitest tests; `e2e/runthrough.cjs` covers add → review → export → clear storage → import → verify, offline reload, replace-everything, seed deck, bulk paste, next-day production card, and automatic backup in download and folder modes.
- **Nothing has been tested on a real device.** See "Unverified" below. This is the largest open risk.

## The owner

Sole user. American, long-term resident of Japan, moving into Japanese-language office work. Passed N1; the gap is written business vocabulary and keigo set phrases. Studies in 5-minute bursts and does not sustain long sessions. Devices: Galaxy S24 Ultra (Brave or Chrome), Windows 11 desktop (Firefox, Brave). Wants direct answers with risks stated, and sources for factual claims.

Standing instruction from the owner for this repo: when a build is finished and tests pass, merge into `main` so Pages deploys.

## Decisions and why

### Storage and backup (most recent work)

The owner flagged that browser storage is fragile and asked whether an automated export or a file-based store would be better.

- **IndexedDB stays the working store.** A file-based primary store needs the File System Access API. Firefox does not implement it and Brave disables it ([brave-browser#11407](https://github.com/brave/brave-browser/issues/11407)); those are three of the owner's four browser/device combinations. Chrome on Android gained it only recently and without atomic writes ([Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c)). The origin-private file system works everywhere but is cleared together with IndexedDB, so it adds no durability.
- **Automatic backup to a real file was added instead**, in two modes (`Settings.autoBackup`):
  - `download` (default, works everywhere): at session end, if the deck changed and the interval has passed, download `goi-auto_DATE_LABEL.json`. It runs at session end because a download needs a user gesture and the last rating tap still counts.
  - `folder` (Chromium only): write into a user-chosen folder silently, debounced 20 s after any change, on `visibilitychange → hidden`, at session end, and on opening the Today screen. One file per day, newest `autoBackupKeep` (14) kept.
- **Safeguards:** an empty deck is never backed up; a chosen folder that already holds a backup with data this device lacks triggers the import summary before any write; rotation only deletes this device's own `goi-auto_*` files; a failed folder write at session end falls back to a download; settings are only updated after the write succeeds.
- **"Is there anything new to back up" is a fingerprint** (`deckMark`: card count, live count, max `updated`, log count, last log time) compared with `Settings.lastBackupMark`.
- `lastExportAt` now means "last backup of any kind". The 7-day reminder on the Today screen is unchanged and acts as the alarm if automatic backups stop working.

### Scheduling

- **Overdue spreading is stateless.** Nothing is rescheduled. Each day takes the due reviews with the lowest retrievability up to the cap. A backlog smaller than the cap therefore arrives in one day; this was judged within the owner's stated tolerance (the cap) and was reported to them.
- **New cards pause while due reviews exceed the cap** (`pauseNewDuringBacklog`, default on).
- **The new-card cap counts each direction.** At 8 per day, steady state is about 4 new words plus 4 production cards. Reported to the owner; not yet confirmed as what they want.
- **Production unlocks** when recognition first reaches the review state with a pass, and is offered from the next study day. Unlocked productions are queued ahead of brand-new words.
- **One direction per card per day** (sibling burying).
- **Learning steps are ts-fsrs defaults** (1 m, 10 m; relearning 10 m), with a 20-minute learn-ahead so a session can finish.

### Merge

- Text follows the newer `updated`. Progress is merged separately, per direction, from review logs: superset wins, divergence is replayed through FSRS. This deviates from the brief's literal "keep the newer `updated` version" for scheduling state, deliberately, and is documented in the README.
- Settings are per device and never merged.

### UI

- English interface, Japanese content. `<html lang="ja">` so CJK glyphs render in their Japanese forms; translation prompts are suppressed.
- Furigana goes on the target word inside the example sentence. The headword shows furigana only when there is no example. The recognition prompt never shows furigana (the reading is the answer).
- Toasts appear at the top so they never cover the thumb-zone buttons.

## Unverified

1. **Real devices.** No run on the S24, in Brave, or in Firefox. PWA install, safe-area insets, keyboard behaviour in quick add, and download behaviour on Android are all untested.
2. **Audio.** The build environment has no Japanese voice. Only the "no voice installed" path was exercised. Voice selection on Android may be ignored by the system.
3. **Folder backup against a real folder.** Tested only with the folder picker pointed at the origin-private file system. Not tested: the real picker, permission re-prompts after a restart, a cloud-synced folder, Chrome on Android.
4. **Brave's flag.** Reports say Brave on Windows can enable the File System Access API under `brave://flags`, and that it does not work on Android. Not verified, so the README does not promise it.
5. **Seed deck content.** 182 cards written without a dictionary check. All tagged `seed-unverified`. Readings, register labels and example naturalness need a native check.
6. **Reading autofill** in quick add relies on IME composition events; behaviour varies by keyboard.

## Suggested next steps, in order

1. Get the owner to do a real-device pass and report what breaks. Most likely trouble spots: quick-add IME autofill, automatic downloads on Android (duplicate-download prompts), TTS voice availability.
2. Confirm two behaviours the owner has not explicitly accepted: each direction counting against the new-card cap, and a sub-cap backlog arriving in one day.
3. Seed deck review. Fix entries in `src/data/seed.ts`. Editing meanings or examples is safe; changing a `word` or `reading` changes the card id (see `CLAUDE.md`).
4. Ideas raised but not built, none requested:
   - A local snapshot taken automatically before *Merge* or *Replace everything*, so a bad import can be undone.
   - Sharing the backup as a file type Android's share sheet accepts (JSON is often refused by `navigator.canShare`).
   - Suspending leeches rather than only flagging them.
   - Running the browser run-through in CI.
   - A light-theme flash on load for users who chose light (the default attribute is dark until settings load).

## Environment notes for cloud sessions

- **`git push` returned 403 on the first attempts** ("Claude doesn't have GitHub access"), then succeeded after the branch had been created through the GitHub API. If a push is refused, try creating the branch with the GitHub tools and pushing again before concluding access is missing.
- **`bunt3.github.io` is not reachable from the build container**, so the live site cannot be fetched from there. Confirm deploys by reading the Actions run instead.
- **Headless Chromium's default (incognito) contexts crash** when a stored OPFS directory handle is read back from IndexedDB. The folder-backup part of the run-through uses `launchPersistentContext` for that reason.
- `vite preview` sends `Vary: Origin`. The service worker's cache lookups use `ignoreVary` so precached files still match; do not remove it.
- npm resolved `ts-fsrs` to 5.4.2 (FSRS-6) in this environment even though a 6.x was listed. The code targets the 5.x API.
