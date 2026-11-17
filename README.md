# Goi 語彙

A personal, offline-first Japanese vocabulary trainer. Installable PWA, one codebase for Android and desktop browsers. No backend, no accounts, no analytics, no network calls after the app has loaded.

- Spaced repetition with [FSRS-6](https://github.com/open-spaced-repetition/ts-fsrs) (`ts-fsrs`), separate schedules for recognition and production.
- Daily caps on reviews and new cards. A backlog after missed days is worked off gradually, weakest cards first. No streaks.
- Quick sessions that end after 5 minutes or 20 cards (both adjustable).
- One-button JSON backup, merge-on-import, Anki TSV export.
- Quick add, pasted TSV/CSV import, listening mode (device text-to-speech), furigana on the target word.

Live at **https://bunt3.github.io/goi-app/**

## Contents

- [Develop](#develop)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Installing as an app](#installing-as-an-app)
- [Moving data between devices](#moving-data-between-devices)
- [How scheduling behaves](#how-scheduling-behaves)
- [The JSON backup schema](#the-json-backup-schema)
- [Anki export](#anki-export)
- [Listening mode and voices](#listening-mode-and-voices)
- [Project layout](#project-layout)
- [Known limits](#known-limits)

## Develop

Needs Node 20 or newer (built and tested on Node 22).

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run dev` serves at `http://localhost:5173/goi-app/`. The service worker is only registered in production builds; use `npm run build` then `npm run preview` (`http://localhost:4173/goi-app/`) to exercise offline behaviour.

### Browser run-through

`e2e/runthrough.cjs` drives the production build in headless Chromium: add card → review → export → clear storage → import → verify restored, plus offline reload, replace-everything, the seed deck, bulk paste and the next-day production card.

```bash
npm run build
```

```bash
npm run e2e
```

Playwright is deliberately not a project dependency. Install it once with `npm i --no-save playwright` followed by `npx playwright install chromium`. Screenshots land in `e2e/out/`.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` on every push to `main`.

One-time setup in the repository on GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.** Without this the workflow's `configure-pages` step fails.
2. Push to `main` (or run the workflow by hand from the Actions tab).

The site is served from `/goi-app/`. That path appears in three places which must agree if the repository is ever renamed:

| File | Setting |
| --- | --- |
| `vite.config.ts` | `BASE = '/goi-app/'` |
| `public/manifest.webmanifest` | `id`, `start_url`, `scope` |
| `index.html` | nothing to change — Vite rewrites its URLs from `BASE` |

Each deploy produces a new service worker. Open copies of the app pick it up on their next launch and show an "App updated — Reload" notice; they never reload themselves mid-review.

## Installing as an app

Open https://bunt3.github.io/goi-app/ once while online. Everything is cached on that first visit.

**Android (Brave or Chrome):** menu (⋮) → *Add to Home screen* → *Install*. It then opens full-screen from the launcher and works without a connection.

**Windows 11, Brave (or Chrome/Edge):** click the install icon at the right of the address bar, or menu → *Save and share* → *Install page as app*.

**Windows 11, Firefox:** Firefox on desktop does not install PWAs. The site still works offline in a normal tab once it has been loaded: bookmark it or pin the tab. When Firefox asks whether the site may store data in persistent storage, allow it.

After installing, open **More** and check the storage line under *Backup & transfer*. If it says storage is not protected, press *Ask the browser to protect this data*. Chromium browsers grant this silently for installed or frequently used sites; Firefox asks.

## Moving data between devices

There is no sync. Data moves by file.

1. On the source device: **More → Export backup (JSON)**. On Android, *Share backup…* sends the same file straight to Drive, email, Quick Share and so on. Set a *device label* first so files are easy to tell apart: `goi-backup_2026-11-17_s24.json`.
2. Get the file to the other device however you like.
3. On the target device: **More → Import a backup…** and pick the file. A summary of what would change appears. Nothing is written yet.
4. Press **Merge into this device**.

To keep two devices in step, export from each and import into the other. Merging is safe to repeat; importing the same file twice changes nothing.

### What merge does

- **Cards** are matched by `id`.
  - Only in the file → added.
  - Only on this device → left alone.
  - On both → the text (word, reading, meanings, examples, tags, register, source, deleted flag) of whichever side has the newer `updated` timestamp wins. A tie keeps this device's version.
- **Review logs** are unioned and de-duplicated by `id`, and also by (card, direction, time, rating).
- **Review progress** is merged per card and per direction, separately from the text, because reviewing does not change `updated`:
  - one side has reviews the other lacks → that side's scheduling state is used;
  - both sides have reviews the other lacks → the state is rebuilt by replaying the combined history through FSRS.
- **Deleted cards** stay in the data as tombstones (`deleted: true`), so a deletion on one device carries over instead of the card reappearing. Editing a card after it was deleted elsewhere brings it back.
- **Settings** are not merged. Each device keeps its own.

### Replace everything

The import summary also offers **Replace everything…**, behind a second confirmation. It erases this device's cards and history and loads the file as-is, including its settings (this device's own label and voice choice are kept if set). Use it to restore after site data was cleared, or to make one device an exact copy of another.

### Backups

Browsers can clear site data, and uninstalling the app or clearing browsing data removes everything. The export is the only backup. The Today screen shows when you last exported and starts prompting once that is more than 7 days ago.

## How scheduling behaves

- **Ratings.** Again / Hard / Good / Easy, each labelled with the interval it would give. FSRS-6 defaults: learning steps of 1 and 10 minutes, a 10-minute relearning step, target retention 90% (adjustable 80–95%).
- **Study day.** Rolls over at 04:00 local time.
- **Review cap** (default 40/day). Counts reviews of cards already in the review phase. Learning-step repeats within a session are not counted.
- **New-card cap** (default 8/day). Each direction counts, so a word's production side uses a slot on a later day.
- **Missed days.** Nothing is rescheduled. Each day the app takes the due cards with the lowest predicted recall, up to the cap; the rest wait. A backlog of 100 at a cap of 40 therefore takes three days (40, 40, 20) alongside whatever else falls due. The Today screen says how many days the backlog spans; Stats shows the capped forecast.
- **New cards during a backlog.** Held back while due reviews exceed the cap (can be turned off in More).
- **Production.** Locked until the card's recognition side first graduates to the review phase with Hard, Good or Easy. It is offered as a new card from the following day, unlocked productions ahead of brand-new words.
- **One direction per card per day.** If both sides of a card are due on the same day, the weaker is shown and the other waits until tomorrow, so one prompt doesn't give away the other.
- **Inbox.** Cards without a reading or an English meaning are not scheduled until completed.
- **Leeches.** 8 or more lapses in either direction. They are flagged and filterable, not suspended. The edit screen offers *Reset progress* for use after rewriting one.

## The JSON backup schema

A backup is one UTF-8 JSON file. All timestamps are Unix epoch **milliseconds**.

```jsonc
{
  "app": "goi-app",            // required; other files are rejected
  "schemaVersion": 1,          // files with a higher number are rejected with a message
  "exportedAt": 1794877200000,
  "deviceLabel": "s24",
  "cards": [ /* Card */ ],
  "reviewLogs": [ /* ReviewLog */ ],
  "settings": { /* Settings */ }
}
```

### Card

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID. Identity for merging. Seed cards use a deterministic UUID derived from word + reading. |
| `word` | string | |
| `reading` | string | Kana. |
| `meaning_en` | string | Empty string if not yet filled in (card is in the Inbox). |
| `meaning_ja` | string | Optional short Japanese definition; empty string if none. |
| `example_ja` | string | |
| `example_en` | string | |
| `tags` | string[] | Built-in: `電話応対` `メール` `会議` `人事・契約` `IT` `接客` `日常`; plus any custom tags; `seed-unverified` on seed cards. |
| `register` | string \| null | `casual`, `polite`, `尊敬語`, `謙譲語`, `written-only`, or `null`. |
| `source` | string | Free text. |
| `created` | number | |
| `updated` | number | Bumped by text edits and deletion only, never by reviews. |
| `deleted` | boolean | Tombstone. |
| `srs` | object | `{ "recognition": SrsState, "production": SrsState }` |
| `productionUnlockedAt` | number \| null | Time of the first successful recognition review. |

### SrsState

The `ts-fsrs` card object with dates as numbers.

| Field | Type | Notes |
| --- | --- | --- |
| `due` | number | |
| `stability`, `difficulty` | number | FSRS memory state. |
| `elapsed_days`, `scheduled_days` | number | |
| `learning_steps` | number | Position in the (re)learning steps. |
| `reps`, `lapses` | number | |
| `state` | 0–3 | 0 New, 1 Learning, 2 Review, 3 Relearning. |
| `last_review` | number \| null | |

### ReviewLog

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID. |
| `cardId` | string | |
| `direction` | string | `recognition` or `production`. |
| `rating` | 0–4 | 1 Again, 2 Hard, 3 Good, 4 Easy. 0 = manual progress reset. |
| `reviewedAt` | number | |
| `stateBefore`, `stateAfter` | 0–3 | As `SrsState.state`. |
| `elapsedDays` | number | Days since the previous review of that direction. |
| `scheduledDays` | number | Interval assigned, in days (0 for same-day learning steps). |
| `durationMs` | number | Time on the card, capped at 2 minutes. |

### Settings

`deviceLabel`, `maxReviewsPerDay`, `maxNewPerDay`, `pauseNewDuringBacklog`, `quickMinutes`, `quickCards`, `requestRetention`, `furigana`, `ttsVoiceURI`, `ttsRate`, `listenSource` (`example` \| `word`), `theme` (`dark` \| `light`), `lastExportAt`.

A hand-edited file is accepted as long as `app`, `schemaVersion`, `cards` and `reviewLogs` are present and each card has an `id`; missing fields get defaults. The TypeScript definitions are in [`src/types.ts`](src/types.ts) and the validation in [`src/data/export.ts`](src/data/export.ts).

## Anki export

**More → Export for Anki (TSV)** writes a tab-separated file with Anki's file headers (`#separator`, `#columns`, `#guid column`, `#tags column`). In Anki: *File → Import*, pick the file, choose a note type with matching fields. Columns: GUID, Word, Reading, Meaning (EN), Meaning (JA), Example (JA), Example (EN), Register, Source, Tags.

Review history is not included: Anki has no text import format for scheduling.

## Listening mode and voices

Listening mode uses the browser's `speechSynthesis` with whatever Japanese voices the operating system provides. It downloads nothing. If no Japanese voice is found, the Listen tab says so and shows these steps.

**Windows 11:** Settings → Time & language → Speech → Manage voices → Add voices → Japanese. If it isn't listed, add 日本語 under Language & region with Text-to-speech ticked. Restart the browser.

**Android:** Settings → General management → Text-to-speech → choose the Google or Samsung engine → gear icon → Install voice data → 日本語. Reopen the app.

## Project layout

```
src/
  types.ts            data model, schema version
  day.ts              study-day boundaries (04:00 rollover)
  db.ts               Dexie tables: cards, logs, meta
  store.ts            in-memory deck with write-through to IndexedDB
  cards.ts            card factory
  srs/fsrs.ts         ts-fsrs wrapper: review, preview, replay
  srs/queue.ts        daily queue: caps, overdue spreading, unlocks, forecast
  data/export.ts      backup build / parse / validate
  data/merge.ts       merge planning (pure)
  data/tsv.ts         pasted TSV/CSV parsing and column guessing
  data/anki.ts        Anki TSV
  data/seed.ts        seed deck (lazy-loaded)
  furigana.ts         target-word furigana and blanking
  tts.ts              speechSynthesis wrapper
  ui/                 views (vanilla TS, no framework)
tests/                Vitest: scheduling, round trip, merge, TSV, furigana, seed
e2e/runthrough.cjs    headless browser run-through
vite.config.ts        base path, service worker generation
```

Runtime dependencies: `ts-fsrs`, `dexie`. Nothing else ships to the browser.

## Known limits

- **Seed deck is unverified.** Its ~180 cards were machine-written and not checked by a native speaker or against a dictionary. Every one is tagged `seed-unverified`; treat readings, register labels and nuance as provisional.
- **No sync.** Two devices diverge until you export and import both ways.
- **Text-to-speech depends on the device.** Voice quality and availability vary; on Android the voice picker may be ignored in favour of the system default Japanese voice. Audio was not testable in the headless environment this was built in.
- **Reading autofill** in quick add takes the kana from the keyboard's composition events. It works with typical Japanese IMEs but is best-effort; check the reading before saving.
- **Furigana and blanking** find the target word by its kanji stem. A word whose example uses an irregular or kana-only form won't be found: it is then shown without highlighting, and the production prompt omits the sentence rather than reveal the answer.
- **Forecast** counts only cards already in review; it does not predict reviews created by cards you study in the meantime.
- **Desktop Firefox** cannot install the app as a standalone window.
- **Clocks.** Merge compares device timestamps. Two devices with badly wrong clocks can pick the older edit.
- **Changing target retention** affects future reviews only, and a merge that replays a card's history uses the current setting for the whole replay.
