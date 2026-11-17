# Goi 語彙

A personal, offline-first Japanese vocabulary trainer. Installable PWA, one codebase for Android and desktop browsers. No backend, no accounts, no analytics, no network calls after the app has loaded.

- Spaced repetition with [FSRS-6](https://github.com/open-spaced-repetition/ts-fsrs) (`ts-fsrs`), separate schedules for recognition and production.
- Daily caps on reviews and new cards. A backlog after missed days is worked off gradually, weakest cards first. No streaks.
- Quick sessions that end after 5 minutes or 20 cards (both adjustable).
- Automatic backups to a real file (a folder you choose, or the download folder), one-button manual export, merge-on-import, Anki TSV export.
- Quick add, pasted TSV/CSV import, listening mode (device text-to-speech), furigana on the target word.
- Tap any word in an example sentence to see whether it is already in the deck, and add it if not.
- Capture: get Japanese text out of a photo, screenshot or video frame on the device, then pick words from it.

Live at **https://bunt3.github.io/goi-app/**

## Contents

- [Develop](#develop)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Installing as an app](#installing-as-an-app)
- [Picking words from sentences](#picking-words-from-sentences)
- [Capture: photos, screenshots, video, text](#capture-photos-screenshots-video-text)
- [Offline dictionary](#offline-dictionary)
- [Decks and starter decks](#decks-and-starter-decks)
- [Keigo training](#keigo-training)
- [Your week, and where you met a word](#your-week-and-where-you-met-a-word)
- [Share to Goi](#share-to-goi)
- [Checker mode](#checker-mode)
- [Interface language](#interface-language)
- [Where your data lives, and automatic backup](#where-your-data-lives-and-automatic-backup)
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

`e2e/runthrough.cjs` drives the production build in headless Chromium: add card → review → export → clear storage → import → verify restored, plus offline reload, replace-everything, the seed deck, bulk paste, the next-day production card, automatic backup in both download and folder modes, the word picker, capture (pasted text, reading rendered light and dark images, a dragged region, a video frame, and reading offline), and the dictionary (install, picking a conjugated verb, slang on the Add screen, the Inbox walk-through, offline lookup, removal, and a build without one).

It needs a build carrying the small test dictionary:

```bash
npm run build:e2e
```

```bash
npm run e2e
```

The folder-backup part points the folder picker at the origin-private file system (the real picker can't be driven headlessly) and runs in a persistent profile, because headless Chromium's incognito contexts crash when a stored directory handle is read back from IndexedDB.

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

## Picking words from sentences

On the answer side of any card with an example (in review and in listening mode), **＋ Word from sentence** opens the sentence as tappable pieces.

- Tap a word to select it. Tap another to stretch the selection across a phrase. Tap inside a selection to narrow it; tap a lone selected piece to clear it.
- Words already in the deck have a dotted underline before you tap anything.
- The panel then says one of:
  - **already in your deck**, with the card (tap it to open);
  - **not in your deck**, with any *related* cards (the same word in another form, such as 承り for 承る, or a phrase that starts the same way), and a short form to add it.
- Adding needs only the word. With no reading or meaning it goes to the Inbox. The sentence it came from becomes its example; the parent card's tags carry over.
- With the [offline dictionary](#offline-dictionary) installed, the selection is looked up: a conjugated form becomes its dictionary form (書きました → 書く), and the reading and meaning are filled in. Other candidates are listed; tap one to use it instead. The sentence stays the example.
- The word field is editable either way.

The split into words comes from the browser's built-in Japanese word breaker ([`Intl.Segmenter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)), which sometimes splits in the wrong place; *Pick by character* switches to one piece per character for those cases. The dictionary does not change the split.

## Capture: photos, screenshots, video, text

**Add → From a photo, screenshot or text** opens the Capture screen. Whatever the source, the result is text in a box that you can correct, and the same word picker underneath.

| Input | How |
| --- | --- |
| Photo | *Photo* opens the camera on a phone (no camera permission is requested by the page; the phone's camera app hands back the picture). |
| Screenshot or image file | *Image*, or drag a file onto the page, or press Ctrl+V with a screenshot on the clipboard. |
| Video | *Video*, pause on the frame that shows the text, *Use this frame*. It is then handled as an image. |
| Text | Type or paste into the text box, or *Paste*. |
| Speech | Use the microphone key on your keyboard (Gboard or Samsung voice input, Win+H on Windows) in the text box. |

Reading an image:

- Drag across the picture to read only that part. A hand-drawn box is widened slightly so tight boxes don't clip characters.
- Recognition runs on the device with [tesseract.js](https://github.com/naptha/tesseract.js) and its Japanese model. **Images are not uploaded anywhere.**
- The first read fetches the engine and model, about 5 MB, **from this site's own address** (`/goi-app/ocr/`). They are then cached and it works offline. This is the one place the app loads something after install, and it is not a third-party request.
- Dark-mode screenshots are inverted automatically.

What to expect from it, plainly:

- Clean horizontal text on a screenshot reads well. In testing, a rendered two-line sample came back with every expected character but one stray extra kana.
- Photos of signs, low light, glare, handwriting, decorative fonts and **vertical text** are unreliable. Only the horizontal model is included.
- Similar-looking kanji get confused. Always check the text box before adding.
- The phone's own recognition (the “T” button in the camera or gallery) and Windows Snipping Tool's *Text actions* are stronger. For a hard image, copy the text there and paste it here.

Speech is deliberately left to the keyboard: the browser speech-recognition API sends audio to a server by default ([MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)), which this app's no-network rule excludes, and it is not usable in Firefox or Brave.

## Offline dictionary

An English–Japanese dictionary the app looks words up in, on the device, with no network after it is downloaded. It fills cards; it never adds cards on its own.

**Browsing.** Add → 📖 Dictionary (or More → Dictionary) opens the dictionary screen: search by any Japanese form (conjugated forms work) or by English, or browse by label: slang, internet slang, colloquial, onomatopoeia, business, 尊敬語, 謙譲語, 四字熟語, idioms, Kansai-ben. Common words come first. Tap an entry for every sense, its labels and its example sentences; choose an example (or none) and a deck, and add it.

**Installing.** More → Dictionary → *Download dictionary*. Nothing is downloaded until you press it. The size is shown on the button (the build log records it; see `HANDOFF.md`). It is installed into its own browser database in the background with a progress bar, and works offline from then on. *Remove dictionary* deletes it; cards are unaffected. If a newer version is published with the app, More offers it.

**What it does.**

- **Word picker and Capture:** the selection is looked up, including conjugated forms (承りました → 承る, 高くなかった → 高い, 食べちゃった → 食べる, 説明しました → 説明, お待ちください → 待つ). The dictionary form, reading and meaning are filled into the form; the sentence the word came from stays the example.
- **Add screen:** as you type, matches are listed under the word. A word found exactly as typed fills the reading, meaning and, if the example is empty, an example sentence from the dictionary. A conjugated form or a homograph (かう: 買う or 飼う) waits for you to tap the right candidate.
- **Inbox:** Cards → Inbox → *Fill in one at a time* opens each incomplete card with the dictionary's candidate filled into its empty fields. Nothing is saved until you press *Save, next*; *Skip* leaves a card as it is. There is no bulk fill: homographs make unattended filling wrong too often.
- **A field you typed is never overwritten.** Only empty fields, or fields the app filled itself, are changed.
- **Tags.** Every card filled from the dictionary gets the `auto-filled` tag, so they can be found in Browse and checked. JMdict's own labels become tags and a register:

| JMdict label | Tag | Register |
| --- | --- | --- |
| `sl` slang, `m-sl` manga slang | `slang` | casual |
| `net-sl` internet slang | `slang`, `internet slang` | casual |
| `col` colloquial, `fam` familiar | `colloquial` | casual |
| `vulg` vulgar | `vulgar` | casual |
| `derog` derogatory | `derogatory` | |
| `arch`, `obs` (first sense only) | `archaic` | |
| any dialect | `dialect` (plus `関西弁` for Kansai, Osaka, Kyoto) | |
| field `bus` / `comp` / `law` / `finc`, `econ` | `ビジネス` / `IT` / `法律` / `経済` | |
| `hon` / `hum` / `pol` / `form` | | 尊敬語 / 謙譲語 / polite / written-only |

**Where it comes from.** [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), the Electronic Dictionary Research and Development Group's dictionary, in the JSON conversion published by [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) (the English file with example sentences). JMdict is used under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html), which requires attribution; jmdict-simplified distributes its converted files under the same licence. The terms apply to the data file, not to the app's own code. Example sentences are from the Tanaka Corpus, maintained by the [Tatoeba project](https://tatoeba.org/). The data is downloaded and compacted when the site is built (`scripts/build-dict.mjs`, run by `.github/workflows/deploy.yml`) and served from this site. Attribution is shown in More.

**Limits.**

- Coverage of slang is good for established slang and behind on current usage. JMdict labels slang reliably but has no frequency information for it.
- Example sentences are of mixed quality, some unnatural, and missing for many business and slang terms. They are only used when a card has no example of its own.
- The first candidate is a best guess. For homographs it is sometimes the wrong word; that is what the `auto-filled` tag is for.
- Deinflection is a rule table written for this app (`src/dict/deinflect.ts`), covering standard verb and adjective forms, polite and humble endings, te-form auxiliaries and common casual contractions (ちゃう, てる, とく, ねえ, ん, ら抜き). Rare classical forms are not covered.
- If the data download failed when the site was built, More says *Dictionary not available in this build*.

## Decks and starter decks

Every card belongs to one deck. Cards you add go to *My cards* unless you pick another deck (Add, Capture and the dictionary screen each have a deck chooser; *New deck…* creates one). The Today screen shows a chip per deck: tap to study only those decks, *All decks* to study everything. More → Decks shows each deck's size, renames or merges a deck, and removes one (moving its cards to *My cards*, or deleting them).

**Starter decks** (More → Starter decks), each loaded into its own deck:

| Deck | Cards | What |
| --- | --- | --- |
| Workplace | ~180 | The original seed deck: phone, email, meetings, HR and contracts, customer and IT support. |
| Modern slang | ~90 | Casual, youth and internet slang. Most terms were found in published rankings (三省堂 今年の新語 2016–2025, 新語・流行語大賞 2021–2025, JC・JK流行語大賞, LINE high-school surveys) or mainstream explainers; the card's Source names it. A small 死語ぎみ group holds words now considered dated. |
| Office slang | ~85 | What office workers say that textbooks skip: なるはや, リスケ, アサイン, 握る, 温度感, chat and remote-work terms, recent buzzwords, a few older managers' phrases. Words already in Workplace are left out. |
| 擬音語・擬態語 | ~125 | Onomatopoeia grouped by situation (weather, food, body, feelings, manner, work, home, sounds, movement), each with an example. |

All were written with AI help; checker mode (below) lets a native speaker go through them. The slang sources were checked from search-result summaries, not full pages. Loading a deck twice adds nothing, a card you deleted stays deleted, and a word you already have (same word and reading) is skipped.

## Keigo training

Today → *敬語 Keigo training* (`#/keigo`). Rounds of 10 short drills, separate from your decks and daily limits:

- **Convert:** a plain verb, word or phrase and a target (尊敬語, 謙譲語, the formal word, office keigo); recall it, reveal, mark *Got it* or *Missed*. 33 verbs (言う → おっしゃる / 申し上げる・申す), 21 words (今日 → 本日, 自分の会社 → 弊社), 12 situations (ちょっと待って → 少々お待ちください).
- **Which kind?** a keigo form (参る, ご覧になる, ございます…): tap 尊敬語, 謙譲語 or 丁寧語.
- **Right or wrong?** an expression (おっしゃられた, ご拝聴ありがとうございました, お召し上がりください…): ○ or ×, with why.

Missed drills come back next round; correct ones come back after 1, 3, 7, 21 and 60 days. Progress is stored in this device's settings (it is in backups but not merged). The intro screen has the full verb table. Forms follow 文化庁「敬語の指針」(2007) as summarised by business-manner guides; where usage is split, the drill answer is the safest office form and the note gives the rest. The data is in `src/data/keigo.ts` and has not been checked by a native speaker.

Why it is a mode and not a deck: the Workplace deck teaches individual phrases; this drills the transformation itself, which flashcards for each form would only scatter across the queue.

## Your week, and where you met a word

Stats opens with **Your week** (also linked from Today): words you added yourself in the last 7 study days and where they came from, answers given, how often reviewed cards were remembered, how many moved into long-term review, and the cards answered *Again* at least twice (with a link to edit them, since a clearer meaning or example usually helps more than repetition). No streaks and nothing about days missed.

**Where from** uses the Source field, which fills itself: the Source box in Capture, the page and site of a shared text, "example sentence for …" when you pick from a card, "dictionary" for dictionary additions. Browse has a *Where from* filter built from it, and each source in Your week links to its cards. Starter-deck cards are left out; their deck already says where they came from. Nothing needs to be entered by hand; cards you typed in without a source simply have none.

## Share to Goi

Select Japanese text in any app (LINE, Slack, a browser, a news app), tap **Share**, and choose **Goi**. The app opens on Capture with the text ready to pick from, and the cards' Source filled in with the page title and site when the sharing app provides them. A link inside the shared text goes into the Source, not the text. Sharing only a link (no selected text) opens Capture with a note explaining what to do.

- **Permissions:** none. The app doesn't read anything you don't share; Android hands over only the shared text.
- **Requirements:** the app must be *installed* (not just a bookmark), because Android only lists installed web apps in the share sheet. After this update you may need to remove and re-add the home-screen app once so Android picks up the new share entry; your cards are stored by the browser, not the icon, so they stay.
- **Where it works:** Chrome on Android supports this. Brave on Android installs web apps differently, and whether it registers share targets is untested. Firefox and desktop browsers don't offer it.
- The share opens `…/goi-app/share?title=…&text=…`, which the service worker serves from cache, so it works offline.

## Checker mode

More → *Checker mode* (`#/check`) is for a native speaker going through your cards. Pick decks, optionally a name, and *Start checking*: one card at a time with ✓ Natural, ✎ Needs a fix, ✗ Wrong (the last two ask for a note: how they would say it). *日本語で表示* switches the interface to Japanese for them. Verdicts are stored on the card and never shown while studying; cards marked fix or wrong are listed under *Notes from checkers* with a link to edit, and the note also appears on that card's edit screen. *Clear note* returns a card to unchecked. Checks travel with backups and merges.

## Interface language

More → Display → *Interface language* switches menus, buttons and messages between English and 日本語 (per device; it survives restarts). Card content is never translated: words, meanings, examples, tags, sources, dictionary glosses and deck names you created stay as written. It exists so a Japanese speaker can look the app and its cards over.

How it works: the code writes English; `src/ui/i18n.ts` translates the rendered text as it appears, using the catalogue in `src/i18n/ja.ts` (exact strings plus patterns for sentences with numbers). Elements marked `data-content` are skipped. A string missing from the catalogue simply stays English.

## Where your data lives, and automatic backup

The working copy of the deck is in the browser's IndexedDB. That is the only storage every target browser offers that works offline with no prompts, but it is not durable: clearing site data, uninstalling the browser, a "clear on exit" privacy setting, or the browser reclaiming space can all erase it. So the app also keeps a copy **outside** the browser, automatically.

**More → Backup & transfer → Automatic backup** has three modes:

| Mode | What happens | Works in |
| --- | --- | --- |
| **Download a file after I study** (default) | When a session ends and something has changed, `goi-auto_DATE_LABEL.json` is saved to the browser's download folder. At most once per study day (or every 3 days / weekly). | Every browser |
| **Save into a folder I choose** | You pick a folder once. From then on the backup is written there silently, about 20 seconds after any change and whenever you leave the app. One file per day, newest 14 kept, older ones removed. | Chrome and Edge on desktop, Chrome on Android |
| **Off** | Nothing leaves the browser unless you export. The Today screen reminds you after 7 days. | — |

Notes on the folder mode:

- It uses the [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). **Firefox does not implement it**, and **Brave disables it** ([brave-browser#11407](https://github.com/brave/brave-browser/issues/11407)); in those browsers the option is not shown and downloads are used.
- Choose a folder inside OneDrive, Google Drive for desktop, Syncthing or similar and the backups also leave the device. The app itself still makes no network requests.
- After a browser restart Chrome may need to re-confirm access to the folder. The Today screen then shows *Allow and back up now*. Installed apps keep the permission ([Chrome 122+](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)); in a normal tab, choose "Allow on every visit" when asked.
- If the chosen folder already contains a Goi backup holding data this device lacks, you are shown the import summary first and nothing is written until you have dealt with it.
- If a write fails at the end of a session (folder moved, drive unplugged), the backup falls back to a download and says so.
- Only this device's `goi-auto_*_LABEL.json` files are ever deleted by the rotation. Manual exports, other devices' files and anything else in the folder are left alone.

In every mode:

- An empty deck is never backed up, so a wiped browser cannot replace a good backup with an empty one.
- A backup is skipped when nothing has changed since the last one.
- Manual export still works and counts as a backup.

**To restore** after data loss: open the app, **More → Import a backup…**, pick the newest `goi-auto_…` or `goi-backup_…` file, then *Merge* (or *Replace everything*).

What is at risk between backups: in download mode, up to one study day of reviews and any cards added since the last session ended. In folder mode, the last few seconds.

## Moving data between devices

There is no sync. Data moves by file.

1. On the source device: **More → Export backup (JSON)**. Where the browser allows sharing JSON files, a *Share backup…* button also appears and hands the same file to the system share sheet; otherwise the file goes to Downloads. Set a *device label* first so files are easy to tell apart: `goi-backup_2026-11-17_phone.json`.
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

## How scheduling behaves

- **Ratings.** Again / Hard / Good / Easy, each labelled with the interval it would give. FSRS-6 defaults: learning steps of 1 and 10 minutes, a 10-minute relearning step, target retention 90% (adjustable 80–95%).
- **Study day.** Rolls over at 04:00 local time.
- **Review cap** (default 40/day). Counts reviews of cards already in the review phase. Learning-step repeats within a session are not counted.
- **New-card cap** (default 8/day). Each direction counts, so a word's production side uses a slot on a later day.
- **Missed days.** Nothing is rescheduled. Each day the app takes the due cards with the lowest predicted recall, up to the cap; the rest wait. A backlog of 100 at a cap of 40 therefore takes three days (40, 40, 20) alongside whatever else falls due. The Today screen says how many days the backlog spans; Stats shows the capped forecast.
- **New cards during a backlog.** Held back while due reviews exceed the cap (can be turned off in More).
- **Production.** Locked until the card's recognition side first graduates to the review phase with Hard, Good or Easy. It is offered as a new card from the following day, unlocked productions ahead of brand-new words.
- **One direction per card per day.** If both sides of a card are due on the same day, the weaker is shown and the other waits until tomorrow, so one prompt doesn't give away the other.
- **Decks.** Today has a chip per deck; choose one or several to study only those. The daily limits are shared across decks, not per deck. Listening mode follows the same choice.
- **Inbox.** Cards without a reading or an English meaning are not scheduled until completed.
- **Leeches.** 8 or more lapses in either direction. They are flagged and filterable, not suspended. The edit screen offers *Reset progress* for use after rewriting one.

## The JSON backup schema

A backup is one UTF-8 JSON file. All timestamps are Unix epoch **milliseconds**.

```jsonc
{
  "app": "goi-app",            // required; other files are rejected
  "schemaVersion": 3,          // files with a higher number are rejected with a message
  "exportedAt": 1794877200000,
  "deviceLabel": "phone",
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
| `tags` | string[] | Built-in: `電話応対` `メール` `会議` `人事・契約` `IT` `接客` `日常`; plus any custom tags. Schema 1–2 put `seed-unverified` on starter-deck cards; reading an older file or database removes it. |
| `deck` | string | Deck name; `''` is the default deck, shown as *My cards*. Added in schema 2: older files are read with `''`, or `Workplace` for cards whose `source` is `seed deck`. Merges like the other text fields. |
| `check` | object \| null | Checker-mode verdict: `{ verdict: 'ok' \| 'fix' \| 'wrong', note, by, at }`. Added in schema 3 (older cards get `null`). Shown only in checker mode and, for fix/wrong, on the card's edit screen. Merges like the text fields. |
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

`studyDecks` (string[]): decks studied on this device; empty means all. Per device like every setting.

Backup bookkeeping, added without a schema bump (older files simply lack them and get defaults): `autoBackup` (`off` \| `download` \| `folder`), `autoBackupDays`, `autoBackupKeep`, `lastBackupMark`, `lastBackupWhere`. On *Replace everything* the three `autoBackup*` settings are kept from the device, not taken from the file.

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
  data/autobackup.ts  when a backup is due, deck fingerprint, folder rotation (pure)
  data/merge.ts       merge planning (pure)
  data/tsv.ts         pasted TSV/CSV parsing and column guessing
  data/anki.ts        Anki TSV
  data/seed.ts        Workplace starter deck (lazy-loaded)
  data/packs/         other starter decks (slang, office, onomatopoeia) and the loader
  decks.ts            deck names, migration, study filter (pure)
  furigana.ts         target-word furigana and blanking
  textpick.ts         split text into tappable pieces; check a selection against the deck (pure)
  dict/entry.ts       compact dictionary entry and manifest types
  dict/deinflect.ts   conjugated form → dictionary form candidates (pure)
  dict/lookup.ts      ranking, tag/register mapping, card fields (pure)
  dictdb.ts           the separate 'goi-dict' database: install, query
  dict-install.worker.ts  downloads and installs the dictionary off the main thread
  ocr.ts              tesseract.js wrapper, lazy-loaded
  tts.ts              speechSynthesis wrapper
  backupfs.ts         File System Access API: folder handle, write, verify, prune
  ui/                 views (vanilla TS, no framework); ui/autobackup.ts runs the backups;
                      ui/picker.ts is the word picker, ui/capture.ts the capture screen,
                      ui/dict.ts the dictionary service and auto-fill, ui/dictpanel.ts its More section
scripts/build-dict.mjs  jmdict-simplified JSON → public/dict/ (manifest + gzipped NDJSON)
tests/                Vitest: scheduling, round trip, merge, auto-backup, text picking, TSV, furigana, seed, dictionary
tests/fixtures/       dict-sample.json (49 hand-written entries in jmdict-simplified's shape) and its generator
e2e/runthrough.cjs    headless browser run-through
vite.config.ts        base path, service worker generation
```

Runtime dependencies: `ts-fsrs`, `dexie`, and `tesseract.js` (loaded only when an image is read). `scripts/copy-ocr.cjs` copies the OCR engine and Japanese model from `node_modules` into `public/ocr/` before `dev` and `build`; that folder is generated and not committed. The dictionary is data, not a dependency: `scripts/build-dict.mjs` writes `public/dict/` (also generated) when `DICT_SOURCE` points at a jmdict-simplified file, plain or zipped; without it the build has no dictionary.

## Known limits

- **The dictionary is unverified on real text.** It was tested against a 51-entry hand-written sample. The real data is fetched only when the site is built and was first seen in CI; lookup quality on real sentences has not been checked by anyone. Auto-filled cards are tagged `auto-filled`.
- **Text recognition is the weak link in Capture.** It was tested only on text rendered by a browser (light and dark backgrounds, one font), never on a real photo, a real screenshot from another app, or a phone camera. Expect worse results on those. Vertical text is not supported.
- **The first image read needs a connection** to fetch about 5 MB from this site. Offline before that, it says so.
- **Video is one frame at a time, chosen by you.** There is no automatic scan of a whole clip, and the browser must be able to play the file's format.
- **Starter decks have not been checked by a native speaker.** Their cards were written with AI help. Use checker mode to have someone go through them.
- **No sync.** Two devices diverge until you export and import both ways.
- **Automatic backup is only as good as where the file goes.** Download mode writes to the same device; if the phone is lost, so is the backup unless you move the file elsewhere. Folder mode into a cloud-synced folder is the only setup that survives losing the device, and it is not available in Firefox or Brave.
- **Download mode leaves files behind.** A web page cannot delete or overwrite downloads, so old `goi-auto_…` files accumulate until you clear them.
- **Folder mode was verified against the origin-private file system in headless Chromium, not against a real folder picker, a real cloud-synced folder, or Chrome on Android**, where writes are not atomic. The app checks the written size and falls back to a download on failure.
- **Text-to-speech depends on the device.** Voice quality and availability vary; on Android the voice picker may be ignored in favour of the system default Japanese voice. Audio was not testable in the headless environment this was built in.
- **Reading autofill** in quick add takes the kana from the keyboard's composition events. It works with typical Japanese IMEs but is best-effort; check the reading before saving.
- **Furigana and blanking** find the target word by its kanji stem. A word whose example uses an irregular or kana-only form won't be found: it is then shown without highlighting, and the production prompt omits the sentence rather than reveal the answer.
- **Forecast** counts only cards already in review; it does not predict reviews created by cards you study in the meantime.
- **Desktop Firefox** cannot install the app as a standalone window.
- **Clocks.** Merge compares device timestamps. Two devices with badly wrong clocks can pick the older edit.
- **Changing target retention** affects future reviews only, and a merge that replays a card's history uses the current setting for the whole replay.
