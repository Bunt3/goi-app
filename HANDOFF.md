# Handoff — state as of 2026-11-18 (Android APK 1.5.0: steps A–E done, motion added; waiting on the owner's phone test)

For whoever picks this project up next. `CLAUDE.md` has the constraints and the invariants that are easy to break; `README.md` has user-facing behaviour and the JSON schema. This file is the status, the reasoning behind decisions that aren't obvious from the code, what is unverified, and what to do next.

## Where things stand

- **Deployed.** `main` builds and deploys to https://bunt3.github.io/goi-app/ through `.github/workflows/deploy.yml`. Pages source is set to GitHub Actions.
- **Built so far, in order:**
  1. The original brief: FSRS-6 scheduling with caps and overdue spreading, two review directions, quick sessions, JSON export and merge import, Anki TSV, quick add, bulk paste, listening mode, furigana, seed deck, browse, stats.
  2. Automatic backup to a real file (download mode everywhere, folder mode in Chromium).
  3. Picking words out of example sentences, and a Capture screen that reads text from photos, screenshots and video frames on the device.
  4. An offline dictionary (JMdict) that fills readings, meanings, tags and examples.
  5. Decks (schema 2), a dictionary browser, and three new starter decks. See "Fifth block" below.
  6. An English / 日本語 interface toggle, so a Japanese speaker can review the app. See "Sixth block" below.
  7. Checker mode (replacing the unverified tag), Share to Goi, the weekly look-back and where-from filter, keigo training, and a visual refresh. See "Seventh block" below.
  8. The Android APK, steps A, B, C and E: Capacitor project, bundled dictionary, saving to Downloads, CI build and signed releases; native speech, the text-selection menu and the share sheet; the update check; folder backups. See "Progress" under NEXT TASK.
- **Checks:** 252 Vitest tests. `e2e/runthrough.cjs` drives the production build through every feature, including on-device text recognition of rendered images, online and offline. `e2e/android-smoke.cjs` checks the Android build's web part.
- **Nothing has been run on a real device by anyone.** This is the largest open risk and it has grown with each block. See "Unverified".

## NEXT TASK: Android APK (Capacitor), then a transitions proposal

**Read this section first. It is the active assignment.** Decided with the owner on 2026-11-18.

### Progress (2026-11-18, eighth block)

**Step A is built; it ships once the owner adds two secrets.** What exists:

- Capacitor 8.6.2 (`@capacitor/core` runtime, `cli`/`android` dev). `capacitor.config.json`, app id `io.github.bunt3.goi`, project in `android/` (Java, not Kotlin: no extra Gradle plugin).
- `vite build --mode android` → `dist-android/`: base `/`, no service worker, `__NATIVE__` true. The web build is unchanged in behaviour and its bundle contains no Capacitor code (checked by grep).
- Dictionary bundled: `prepareBundledDict()` (in `ui/dict.ts`, called from `main.ts`) installs it on start with a toast, also a newer bundled version after an update. More → Dictionary says "Prepare", hides Remove.
- **Found and fixed before any device run:** (1) Android packaging un-gzips `.gz` assets and drops the suffix, so the dictionary and OCR model would 404; the Android build now stores them plain. (2) `await`-ing a promise that resolves to a Capacitor plugin proxy calls a native `then` and hangs; `native.ts` avoids it. (3) Android's WebView ignores `<a download>`, so every backup and export would have silently done nothing; `GoiNativePlugin.saveDownload` writes to Downloads via MediaStore (Android 10+, no permission) or the system save screen (older). Callers now await the save and report failure; an automatic backup is committed only after the file is written.
- Back button handled in `MainActivity` (WebView history, then leave). App icons from the PWA's icon; plain dark splash; `allowBackup=false` plus data-extraction rules so Android doesn't upload app data to Google's cloud backup.
- `.github/workflows/android.yml` (manual run or `apk-v*` tag): tests, real dictionary (fails rather than ship without one), Android build, `assembleRelease`, signs with the secrets, **checks the certificate SHA-256 against the pinned value**, uploads the artifact, publishes Release `apk-v<version>` with notes from `android/RELEASE_NOTES.md`. Without secrets a build-only run produces an unsigned APK (pipeline check).
- `e2e/android-smoke.cjs` (`npm run e2e:android`) checks the Android build's web part in Chromium, including OCR with the plain model.
- Locally verified: signed release APK builds (9.7 MB with the test dictionary; expect about 20 MB with the real one), `apksigner verify` passes, assets are where the app requests them.
- Version raised to 1.1.0 (versionCode 10100).

**Owner action needed:** add repository secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (the keystore was generated in the session and handed to the owner, never committed; alias `goi`; certificate SHA-256 `80adf7a9…3dfc`, pinned in the workflow). Then Actions → Android APK → Run workflow. If the key is lost, generate a new one and change `RELEASE_CERT_SHA256`, but installed copies must then be uninstalled first (data loss without a backup).

**Facts checked this block** (were in "Not verified"):

- `dl.google.com` was blocked in the default cloud environment (proxy 403). The session moved to a personal environment `goi-app` that allows it; `maven.google.com`, Maven Central and `services.gradle.org` were already reachable (Maven Central sometimes answers 429; retry). SDK installed at `/opt/android-sdk` (cmdline-tools 16111833, platform 36, build-tools 35.0.0), JDK 21 is on the image. A fresh container needs the SDK again: `sdkmanager "platforms;android-36" "build-tools;35.0.0"` after unpacking cmdline-tools, and `android/local.properties` with `sdk.dir=/opt/android-sdk`.
- Capacitor 8 needs Node ≥ 22; Node 22.23 here and in CI. AGP 8.13.0, Gradle 8.14.3, compileSdk/targetSdk 36, minSdk 24.
- No emulator here, so nothing native has run. Unverified on the phone: the save to Downloads, the back button, edge-to-edge insets (Capacitor's SystemBars `native` handling with `viewport-fit=cover`), the keyboard over the bottom sheet, the camera input, dictionary preparation time on the real 219k-entry file from inside the APK.

**Released:** the secrets were added and `apk-v1.1.0` was published by the workflow on 2026-11-18 (signed, certificate check passed, 20.9 MB with the real dictionary).

**Step B (1.2.0):**

- Speech: `Speech.java` wraps Android `TextToSpeech`; `GoiNativePlugin` exposes `ttsVoices({refresh})`, `speak({text, rate, voice})`, `stopSpeaking`, `openTtsSettings`. Only Japanese voices that are installed and need no network. `tts.ts` branches on `__NATIVE__`; Listen shows Android steps and a settings button when there is no voice. Manifest `<queries>` for `TTS_SERVICE` (Android 11+ package visibility).
- Incoming text: intent filters for `PROCESS_TEXT` (label "Goi") and `SEND` text/plain on `MainActivity`. The plugin holds the text (`takeShare`) and fires a retained `share` event for warm starts; `readAppShare` (pure, tested) maps it to the existing Capture path, naming the sending app when nothing else does. Source app comes from the activity referrer, else the calling package.
- `e2e/android-smoke.cjs` now runs against a fake native side with the bridge's real contract and checks every native call's name, options and handling.
- Unverified on a phone: everything native. Specifically: the selection menu label (some apps put third-party entries under ⋮), whether the referrer names the app for `SEND` (often it doesn't; then the Source is "shared" or the page), Samsung TTS voice names and `isNetworkConnectionRequired` flags, and whether `singleTask` brings Goi forward cleanly from the selection menu.
- Not built: sharing an image to Goi (would feed Capture's image path; small follow-up if wanted).

**Owner's phone test of 1.2.0 (2026-11-18):** all the "tell me straight away" items passed (install, import, dictionary, export to Downloads). The smaller items were not reported yet. The owner then asked for E before C and to carry on unattended until their input is needed.

**Step E (1.3.0):** More → Updates (APK only). `src/update.ts` (pure, tested): version compare, `parseRelease` (only `apk-v…` tags, only github.com links), `readUpdateAnswer` (404 = private repo or no release, rate limit, failures), `plainNotes`. `ui/update.ts` does one `fetch` to the releases API on the button press (GitHub sends `Access-Control-Allow-Origin: *`, checked), and `GoiNative.openUrl` opens only `https://github.com/` links in the browser. No in-app download or install: Android requires its own confirmation anyway, and an in-app download would fail while the repo is private. The smoke test fakes GitHub's answer and asserts the request happens only on a press.

**Step C (1.4.0):** folder backups in the APK. `BackupFolder.java` keeps a persisted SAF tree permission (URI in SharedPreferences, old permission released on change) and lists, reads, writes, deletes files directly in the folder by name. Overwrite uses mode "wt"; if the provider refuses it, the old file is deleted and a new one created (plain "w" can leave the old tail). `native.ts` wraps it as a folder handle, so `backupfs.ts`, `ui/autobackup.ts` and the More screen run unchanged (four `__NATIVE__` branches in `backupfs.ts`: supported, saved, choose, forget). Permission lost shows as "permission needed"; re-granting means Change folder…, because Android can't re-ask without the picker. Unverified on a phone: providers other than local storage (Google Drive's folder provider in particular: "wt" support, reported sizes, `lastModified`), and whether the `visibilitychange` write finishes before Android pauses the WebView (the 20-second debounce covers it if not).

**Step D (ML Kit), research done, waiting on the owner:**

- Google's ML Kit Android data-disclosure page (as quoted by search results; the page itself is on a host this environment blocks) says ML Kit collects device information (manufacturer, model, OS version and build, ML accelerators), app package name and version, performance metrics (latency), API configuration (image format and resolution), and event types and error codes, "for diagnostics and usage analytics", sent over HTTPS and not shared with third parties. It does not mention any opt-out. Images and recognised text are not in the list.
- Checked in the library: `com.google.mlkit:text-recognition-japanese:16.0.1` → `com.google.mlkit:common:18.11.0` → `com.google.android.datatransport:transport-backend-cct:2.3.3`, whose endpoints (stored split in two interleaved strings) decode to `https://firebaselogging.googleapis.com/v0cc/log/batch?format=json_proto3` and `https://firebaselogging-pa.googleapis.com/v1/firelog/legacy/batchlog`. A 2022 Stack Overflow report describes ML Kit posting to the first one every 15 minutes, with no supported switch.
- Options for the owner: (1) keep tesseract only (no change); (2) ML Kit and accept the usage reports to Google; (3) ML Kit with the reports blocked by the app itself: an Android network security config that pins those two hosts to a certificate that can't match, so the upload's TLS handshake fails (a standard Android mechanism; applies to the platform HTTPS stack the uploader uses; unverified on a device), optionally plus excluding `transport-backend-cct` in Gradle (may break ML Kit at runtime; would need testing). Size: Google documents about 4 MB per script per CPU architecture for bundled models; limiting the APK to arm64 keeps that to one copy.
- Recommendation given to the owner: (3) with the pinning only, if they want better photo recognition.

**Motion demo (published 2026-11-18):** a private Artifact, https://claude.ai/artifact/KiKSDFSKwLgQpvFcMcany4, built from the app's own tokens. Five moments, A = today's behaviour: 1 screen changes (B cross-fade 140 ms, C slide and fade 220 ms), 2 answer reveal (B card flip 280 ms, C unfold below 200 ms), 3 rating press (B press and settle 180 ms, C press and fill 200 ms), 4 word-picker sheet (B slide 200 ms, C spring 260 ms), 5 session progress (B thin bar 250 ms, C dots 160 ms). Suggested: 1B 2C 3B 4C 5B. Every option is under 300 ms, accepts input while moving, and becomes instant or a ≤100 ms fade with reduced motion. The owner replies with one letter per row; build only those. Screen changes would use View Transitions where supported (Chromium, Android WebView) and stay instant in Firefox.

**Owner's decisions (2026-11-18):** D option 3 (ML Kit with usage reports blocked), and motion 1B 2C 3C 4C 5B.

**1.5.0:**
- ML Kit: `GoiNativePlugin.recognizeText` (data: URL in, `Text.getText()` out), `TextRecognizer` kept until destroy. `ocr.ts` tries it first in the APK and falls back to tesseract on any failure (logged, not shown: the result still arrives). The same `prepareForOcr` canvas is sent (tuned for tesseract; ML Kit has not been tuned or compared on real photos). Reports blocked by `network_security_config.xml` (pins). ABIs limited to arm64-v8a and armeabi-v7a; ML Kit's `.so` is 11 MB + 7 MB stored uncompressed, so the APK grew by about 20 MB (the earlier "about 4 MB" estimate from Google's docs was wrong for this model). Dropping `armeabi-v7a` would save 7 MB; it was kept so 32-bit phones can still install. Unverified on a phone: the pin actually blocking the uploads, recognition quality, vertical text.
- Motion: screens fade in (140 ms, a plain animation rather than View Transitions, so taps are never held); the answer unfolds (`goi-unfold`, 200 ms); rating buttons fill with their colour and the others dim while pressed (`:active`, so the next card is never delayed, a deliberate change from the demo's 200 ms held fill); the picker sheet springs up (260 ms, a `box-shadow` fills the overshoot gap); a 4 px session bar (`#session-bar`) grows per answer (250 ms). All fall back to instant or a 100 ms fade with reduced motion. Applies to the website too (same code).

**Next, waiting on the owner:** the phone test of 1.5.0 (see the release notes' list), including the smaller items from the first checklist.

### What the owner wants

- The app as an **APK** they download from GitHub (Releases) and sideload; they know how to allow non-Play-Store installs.
- **No data needed after install**, including the dictionary. **No persistent online dependencies.**
- **An update check against GitHub**, which the owner asked for. Make it a button they press, never automatic. This is the one approved exception to "no requests to other origins", and it applies to the APK only.
- The repo may be **made private** for long stretches. They expect to work with Claude while it's private.

### Design (decisions already made; justify any change)

1. **Wrap the existing web build with Capacitor** (Android platform). The WebView loads the bundled `dist/` from the APK, not from a URL. A Trusted Web Activity was rejected because it needs the website online. One codebase: native features go behind a small `src/native.ts` bridge with web fallbacks, so the web build is unaffected.
2. **Bundle the dictionary in the APK.** The ~10 MB gzip `dict/` file goes into the assets, and the install worker reads it from the bundle on first run. No download button in the APK, just a one-time "Preparing dictionary…" step. Expected APK size is about 30 MB, including OCR.
3. **Build in GitHub Actions:** JDK, Android SDK, Gradle, then `assembleRelease`. Attach `goi-<version>.apk` to a GitHub Release on a tag such as `apk-v1.2.0`. The build container here probably can't download the Android SDK (`dl.google.com` is likely blocked); verify, and otherwise build only in CI. A separate workflow keeps `deploy.yml` unchanged.
4. **Signing key.** Generate a release keystore once and store it as Actions secrets (`ANDROID_KEYSTORE_BASE64`, passwords, alias). **Tell the owner to keep an offline copy.** Android only installs an update signed with the same key, and losing it means uninstalling, which wipes app data unless there's a backup. Never commit the key.
5. **Update check:** compare the installed version with `api.github.com/repos/Bunt3/goi-app/releases/latest`, then show the release notes and a link to the APK. Anonymous API calls only see public repos, so while the repo is private the check should say so plainly. The owner can still download Releases from a private repo while logged in to GitHub on the phone, so making the repo public is **not** needed for the APK route.
6. **Moving data:** the APK's WebView storage is separate from Brave's. The owner exports a backup from the PWA and imports it into the APK once. Say this clearly in the first release notes.

### Native features, in order of value (all offline)

1. **Text-selection menu entry** (`ACTION_PROCESS_TEXT`): long-press Japanese in any app → "Goi" → opens Capture with the text. Also handle `ACTION_SEND` (the share sheet). Both feed the existing `setPendingShare` path.
2. **Native text-to-speech** (an Android TTS plugin). **Android WebView does not implement `speechSynthesis`**, so listening mode is broken in the APK without this. It's required, not optional.
3. **Automatic backups into a real folder** via Android's Storage Access Framework: the user picks a folder once and backups are written silently, matching folder mode on Chromium desktop. Reuse `src/data/autobackup.ts` (pure) and add a native writer.
4. **Better photo text recognition:** Google ML Kit text recognition v2, Japanese model, **bundled** variant (on-device, no download). It's much better than tesseract on real photos. **Before using it, check whether ML Kit sends usage telemetry and whether it can be turned off.** Report to the owner and let them decide. Keep tesseract as the web fallback.
5. **Durable storage** comes free: app-private, cleared only on uninstall or "clear data".
6. **Later, only if asked:** a home-screen widget, offline speech input, and gentle reminders. Reminders must never nag or carry guilt (hard constraint).

### Order of work, with safe stopping points

- **A:** Capacitor project, CI workflow, signed release APK that runs the current app offline with the bundled dictionary. Owner installs it and imports a backup. *Ship.*
- **B:** native TTS, plus the text-selection and share intents.
- **C:** folder backups through SAF.
- **D:** the ML Kit decision, made with the owner after the telemetry check; implement if approved.
- **E:** the update-check button.

### Not verified (check before relying on it)

- Whether `dl.google.com` and the Gradle/Maven repositories are reachable from the build container.
- Whether Capacitor's current major version supports the installed Node version.
- Exact plugin names for TTS, `PROCESS_TEXT` and SAF: they may need small custom Capacitor plugins written in Kotlin.
- The ML Kit telemetry behaviour.
- Brave/WebView differences that affect the existing UI (IndexedDB quotas, `DecompressionStream`, module workers in the WebView).

### Testing

Vitest and the web run-through still cover the shared code and must stay green. Android-only features can't be run in the build container; the owner tests them on the phone. Each release's notes should list what to try.

### Then: transitions and motion (research + proposal, not a rewrite)

The owner wants to learn what tasteful animation could add: screen transitions, the card reveal, rating feedback, toasts and sheets. Nothing "wild" (no avatars). Produce a small **demo page (an Artifact or a hidden `#/motion` lab screen)** showing 4–6 options side by side, for example:

- screen changes with the View Transitions API (supported in Chromium and Android WebView);
- a card flip vs fade-up reveal;
- a subtle press and settle on rating buttons;
- the bottom sheet sliding with a spring;
- a progress tick in sessions.

Every option must respect `prefers-reduced-motion` and stay under about 300 ms. The owner picks; then implement only what they choose. Motion must never slow a 5-minute session.

### Earlier open items (still true)

- Nothing has been tried on the phone yet beyond reloading the PWA. Share to Goi in Brave is unverified.
- Checker mode is ready if a native speaker ever helps.
- The JMdict/Tatoeba licence wording is unverified (see the dictionary section).

## Seventh block (2026-11-18, overnight)

The owner asked, while asleep, for: removing the visible "unverified" marking but keeping a checker mode that privately knows what was checked; Share to Goi; review by where a word was met *only if* it needs no manual work; keigo practice as its own mode if it isn't redundant with the decks; a weekly look-back; and research then a visual refresh. Subagents were left to the session's judgement: two ran research in parallel (visual design brief; keigo table against 敬語の指針). Both could read search results only, not full pages; the brief's sources and the keigo draft's confidence notes are summarised in README and `src/data/keigo.ts`. Coding stayed in the main session because every phase touched the same files.

- **Checker mode** (`#/check`): `Card.check` (schema 3) holds `{verdict, note, by, at}`. The schema-3 migration strips the old `seed-unverified` tag. Nothing outside checker mode shows check status, except a flagged card's note on its edit screen (to act on it). The intro has a one-tap 日本語 switch for the checker.
- **Share to Goi:** `share_target` (GET) → `/goi-app/share` → `main.ts` → Capture. No permissions. Requires the installed app; Android caches the manifest, so re-adding the home-screen app once may be needed.
- **Where from:** no manual entry; groups come from the Source field that capture, sharing, the picker and the dictionary already fill (`src/week.ts`). Browse filter + links from Your week. Starter-deck cards excluded.
- **Your week** on Stats (linked from Today): own words added and where from, answers, recall, cards graduated, cards answered Again twice or more. No streaks, no missed-day counts.
- **Keigo training** (`#/keigo`): 33 verbs, 21 words, 12 situations (convert), 30 forms (which kind), 12 expressions (right or wrong). Box schedule in `Settings.keigo`. Not covered by checker mode.
- **Visual refresh:** tokens and a design layer at the end of `styles.css` ("sumi and washi" brief: warm charcoal / paper, matcha accent, indigo secondary, tonal surfaces, sentence-case headings, active-tab pill, tinted rating buttons, larger lighter flashcard word, reveal animation that respects reduced motion). Contrast ratios for all text pairs were computed by the research agent (AA everywhere). Colour transitions were removed so theme switches are instant.
- **E2E timing note:** the run-through simulates Tokyo; between 03:40 and 04:00 JST the first review step fails because a 10-minute learning step crosses the 04:00 day rollover. Not an app bug; rerun after 04:00 JST.

## Sixth block: Japanese interface

The owner wants to show the app to a Japanese friend for a native read of the content. More → Display → *Interface language*.

- **Design:** a translation layer over the rendered DOM (`src/ui/i18n.ts`, MutationObserver) with a catalogue in `src/i18n/ja.ts` (~330 exact strings, ~50 patterns). Chosen over wrapping ~350 strings in `t()` across 20 files: one place to change, nothing in the view code, and a missing entry degrades to English instead of breaking. Owner content is excluded by `data-content` markers.
- **Coverage** was measured by a headless walk with the Japanese UI on (every main screen, review, picker, dictionary, decks, bulk paste, import summary); everything it surfaced is translated except proper nouns. Not walked: listening mode with a voice, folder-backup prompts, OCR progress and errors. Those may still show English.
- **Known quirk:** an owner-made deck whose name equals a catalogue key (e.g. "Slang") is shown translated in Today's deck chips.
- **Japanese wording was written by the model.** Have the friend check it too.

## Fifth block: decks, dictionary browser, starter decks

The owner asked for: decks they can toggle for practice; browsing the installed dictionary and building their own decks from it, with example sentences pulled in; a modern slang deck (documented, roughly the last few years, including things like なるはや); then an onomatopoeia deck grouped by daily-life use. They left the use of subagents to the session's judgement.

- **Decks** are a card field (`Card.deck`, schema 2), not tags: one deck per card merges cleanly as text, and the Today chooser stays short. Schema-1 data migrates in `parseExport` and in a Dexie `version(2)` upgrade: cards with `source: 'seed deck'` go to `Workplace`, everything else to `''` (*My cards*). The study choice is a per-device setting (`studyDecks`). Daily limits stay global so choosing a smaller deck doesn't multiply the workload; per-deck limits were not built.
- **Dictionary browser** (`#/dict`): Japanese search runs the deinflecting lookup plus prefix matches; English search is a full scan with an early stop (no gloss index, to keep the database small). Browsing by label needs the `t` field added to the dictionary file (format 2) and a `*t` index (DictDB version 2); installs from the format-1 file show a note and More offers the newer download, because the manifest version changes with the data.
- **Starter decks** (`src/data/packs/`): Modern slang (91 cards, 75 with a named source), Office slang (86, 63 sourced), 擬音語・擬態語 (126). The Workplace seed deck is now one of the packs, with the same ids. `packCards` skips existing ids (including deleted ones) and any word+reading the owner already has. All cards carry `seed-unverified`.
- **Why two slang decks:** office jargon (なるはや, リスケ) and youth/internet slang are used with different people; separate decks let the owner study one without the other. Short-lived catchphrases (ほんmoney, ひき肉です) were left out; words now considered dated (ぴえん, きゅんです) are a separate group so they can be recognised, not used.
- **Research method:** two subagents searched in parallel for documented slang (rankings: 三省堂 今年の新語, 新語・流行語大賞, JC・JK流行語大賞, LINE surveys; explainers: All About, DIME, Oggi, カオナビ, 東洋経済 …). Page fetches to most Japanese hosts failed in the container, so verification is from search summaries; rows the agents could not source were included only where the term is well established, with an empty source.

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

First built by CI on 2026-11-17 ([run 44092584339](https://github.com/Bunt3/goi-app/actions/runs/44092584339)), deployed successfully:

| | |
| --- | --- |
| Source asset | `jmdict-examples-eng-3.6.2+20261116213322.json.zip` (14.2 MB) |
| Entries | 219,127 |
| Example sentences | 32,322 (up to 2 per sense; the examples' key names parsed correctly) |
| Compacted, uncompressed | 28.5 MB |
| Download (gzip) | 10.38 MB, under the 15 MB budget, so no examples were dropped |
| Build time | about 6 s for the dictionary step |

The download is cached in Actions under the asset name, so later deploys reuse it until jmdict-simplified publishes a new release.

Scale check done here before the real data existed, with a synthetic 210,000-entry file of 26.3 MB uncompressed (close to the real 28.5 MB): in headless Chromium with the CPU slowed 4×, install 18 s, 77 MB of storage, first lookup well under a second. Expect similar on the real file. Unmeasured on a phone.

### Dictionary limits to tell the owner

- Slang coverage is good for established slang and lags current usage. Entries are labelled, but there is no frequency information for slang.
- The first candidate is a guess for homographs; `auto-filled` marks every card to check.
- Corpus example sentences are of mixed quality and missing for many business and slang terms; examples cannot be generated without an AI model, which the constraints exclude.
- Deinflection covers standard and common casual forms, not classical or rare ones.

## The owner

Sole user. Target vocabulary: N1+ written business vocabulary and keigo set phrases, with casual, colloquial and slang vocabulary equally important. Studies in 5-minute bursts. Devices to support: an Android phone (Brave or Chrome) and a Windows desktop (Firefox, Brave). Wants direct answers with risks stated and sources for factual claims, and prefers that reasonable decisions are made and justified afterwards rather than asked about first.

This repository is public. Keep personal details about the owner out of it: describe requirements, not the person.

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

0. **The dictionary on real text.** The real file builds (219,127 entries, 10.4 MB download) but has never been installed or queried. Ranking, deinflection coverage on real sentences, install time and storage on the phone are unverified. See "NEXT TASK".
1. **Text recognition on real input.** Tested only on text rendered by headless Chromium in one font, on plain light and dark backgrounds. Not tested: any real photograph, a phone camera, a screenshot from another application, mixed Japanese and Latin layouts, small text. One stray extra kana appeared even in the clean test. Expect materially worse results on photos. Vertical text is unsupported (no `jpn_vert` model shipped).
2. **Recognition speed and memory on the phone.** Sub-second in the build container. A phone will be slower and the engine holds tens of MB; `disposeOcr` runs when leaving the Capture screen.
3. **Word splitting quality.** `Intl.Segmenter` output depends on the browser's ICU version. Tests assert only properties that should hold everywhere. The user-facing escape hatch is *Pick by character*.
4. **Real devices generally.** No run on a real phone, in Brave, or in Firefox: PWA install, safe-area insets, the bottom sheet over the on-screen keyboard, `<input capture>` behaviour, drag-to-select on a touch screen, downloads on Android.
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
