# Goi 語彙 — working notes for coding sessions

Personal Japanese vocabulary PWA for one user. Read `HANDOFF.md` for current status and open work, and `README.md` for user-facing behaviour and the JSON schema.

## Hard constraints (from the owner; do not relax without asking)

- Installable, offline-first PWA. One codebase for Android (Brave/Chrome) and Windows desktop (Firefox, Brave).
- Vite + TypeScript, vanilla DOM. Runtime dependencies are `ts-fsrs` and `dexie` only. No framework, no backend, no accounts, no analytics.
- **No network requests at runtime.** No web fonts, CDNs or lookups. The browser run-through asserts this.
- Served from `https://bunt3.github.io/goi-app/`. The base path lives in `vite.config.ts` (`BASE`) and `public/manifest.webmanifest` (`id`, `start_url`, `scope`).
- Sessions are 5-minute bursts. Never add streaks, guilt wording, or anything that punishes skipped days.
- Mobile-first, controls within thumb reach, dark by default.

## Commands

```bash
npm test            # Vitest, runs in Node with TZ=Asia/Tokyo
npm run build       # tsc --noEmit, then vite build (also emits dist/sw.js)
npm run e2e         # headless run-through of dist/; build first
npm run dev         # no service worker in dev
```

Playwright is not a dependency. `e2e/runthrough.cjs` uses `require('playwright')` from the environment.

Before calling work done: `npm test`, `npm run build`, `npm run e2e` all green. Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Layout

| Path | Role |
| --- | --- |
| `src/types.ts` | Data model, defaults, `SCHEMA_VERSION` |
| `src/store.ts` | In-memory deck + write-through to IndexedDB. All mutations go through here. |
| `src/srs/fsrs.ts` | `ts-fsrs` wrapper: `applyReview`, `previewRatings`, `replayLogs`, `resetProgress` |
| `src/srs/queue.ts` | `buildQueue` (caps, overdue spreading, unlocks, sibling burying), `pickNext`, `forecast` |
| `src/data/merge.ts` | `planMerge`: pure merge planning |
| `src/data/export.ts` | Backup build, parse, validate |
| `src/data/autobackup.ts` | `deckMark`, `backupDue`, `filesToPrune` (pure) |
| `src/backupfs.ts` | File System Access API wrapper |
| `src/ui/autobackup.ts` | Runs backups: triggers, fallbacks, debounce |
| `src/ui/*.ts` | One file per screen; `app.ts` is the hash router and shell |
| `vite.config.ts` | Base path, version constant, service worker generator |

## Invariants that are easy to break

- **Pure modules stay DOM-free.** `srs/`, `data/`, `day.ts`, `cards.ts` run under Node in tests. Browser APIs belong in `ui/`, `tts.ts`, `backupfs.ts`, `furigana.ts` (DOM-building half only).
- **`Card.updated` is bumped only by text edits and deletion, never by reviews.** Merge depends on this to keep an edit on one device and reviews on another.
- **Every change to scheduling state writes a review log.** Merge decides progress by comparing log sets and may rebuild state with `replayLogs`. A manual reset is a log with `rating: 0`. State changed without a log will be silently undone by a later merge.
- **Deletes are tombstones** (`deleted: true`), never row removals. `store.live()` filters them; `store.cards` includes them.
- **Daily counters are derived from today's logs**, not stored, so they survive imports. The study day rolls over at 04:00 local (`day.ts`).
- **Mutations call `store.onChange`**, which schedules folder backups. A new `Store` write method must call it.
- **Backups commit after the write.** Use `store.prepareBackup()` and call `commit()` only once the file is written, so a failed write is not recorded as a backup.
- **An empty deck is never auto-backed-up** (`store.cards.size === 0` guard). Keep it: it stops a wiped browser overwriting a good backup.
- **Seed card ids are deterministic** (`uuidFromName('seed:word:reading')`). Changing that key, or a seed entry's word or reading, creates a duplicate on devices that already loaded the deck.
- **Schema changes.** Adding an optional `Settings` field needs only a default and a line in `parseSettings`. Changing `Card` or `ReviewLog` needs a `SCHEMA_VERSION` bump, a migration in `parseExport`, a Dexie `version()` upgrade in `db.ts`, and a README update.
- **`h()` in `ui/dom.ts`:** `null`/`undefined` props are skipped; `false` is skipped unless the key is a real DOM property. Children may be `null`/`false`, but native `replaceChildren`/`append` do not accept `null`.
- **The service worker source is a template literal inside `vite.config.ts`.** No backticks inside it. Cache lookups use `ignoreVary` on purpose.

## Conventions

- Epoch milliseconds everywhere for time. No `Date` objects in stored data.
- Tests take time as an argument; nothing in pure code calls `Date.now()` implicitly except as a default parameter.
- User-facing wording is plain and neutral. Failures say what happened and what to do; nothing fails silently.
- New behaviour gets a Vitest test in the pure layer and, if it has UI, a step in the run-through.
