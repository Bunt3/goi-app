Goi for Android: the same app as the website, installed from this file instead of the browser. It works with no connection at all: the dictionary and the text recogniser are inside the APK.

## New in 1.5.0

- **Better text recognition from photos.** Capture now reads images with Google's ML Kit, which runs on the phone (the Japanese model is inside the APK) and is much better on real photos than the old reader. The old reader stays as a fallback if ML Kit fails. ML Kit normally sends usage statistics to Google (phone model, Android version, speed, error codes; not your images or text). Goi blocks those two report servers at the network level, so nothing is sent. This makes the APK about 20 MB larger.
- **Small animations**, all under 300 ms and turned off when the phone's "remove animations" setting is on: screens fade in, the answer unfolds below the word, the rating button fills with its colour while pressed, the word-picker sheet springs up, and a thin bar shows progress through a session.

## New in 1.4.0

- **Automatic backups into a folder you choose.** More → Automatic backup → "Save into a folder I choose", then pick a folder in Android's folder picker (for example a "Goi backups" folder you create in Documents). Goi then saves quietly whenever something changes, one file per day, keeping the newest 14 of this phone's automatic backups. It never touches other files in the folder. If the folder already holds a backup with cards this phone doesn't have, Goi shows what it would import and writes nothing until you've seen it. If a write fails or the file doesn't come out the right size, that backup goes to Downloads instead and you're told.

## New in 1.3.0

- **Check for updates** (More → Updates). It asks GitHub for the newest release only when you press it; that is the only time the app contacts another site. If there is a newer version it shows what's new and a Download button that opens the APK in your browser; open the downloaded file and Android asks to confirm the update. While the repository is private, GitHub won't answer the app, so it says so and offers the releases page instead (works when you're logged in to GitHub in the browser).

## New in 1.2.0

- **Speech.** Listening mode and the speaker buttons use the phone's own text-to-speech engine, with voices stored on the phone only, so speech is made on the phone rather than by an online service. If no Japanese voice is installed, the Listen tab explains how and has a button that opens the phone's text-to-speech settings.
- **"Goi" in the text-selection menu.** Long-press Japanese text in any app, choose **Goi** (it may be under ⋮ in the menu), and Capture opens with that text, ready to pick words. The source app's name ("LINE", "Chrome") goes into the Source field.
- **Goi in the share sheet** for shared text. A shared web page link fills the Source with the page and site.

Installing a newer version over an older one keeps your cards.

## Install

1. Download the `.apk` file below on the phone (if the repository is private, be logged in to GitHub in the browser).
2. Open it and allow installs from that browser when Android asks.
3. Open Goi. The first start prepares the dictionary in the background (a minute or two); the app works meanwhile.

## Move your cards from the browser app (once)

The Android app has its own storage, separate from Brave's. Your cards don't move by themselves.

1. In the browser app: More → Export backup (JSON). The file goes to Downloads.
2. In the Android app: More → Import a backup…, pick that file, check the summary, then Merge (or Replace everything).
3. Keep the browser app until you're happy; both can run side by side, and Merge keeps them in step.

## What to try, and tell me if it fails

- The dictionary: More → Dictionary should say Installed after the first start. Pick a word from a sentence in Capture.
- Back button: goes to the previous screen; on Today it leaves the app.
- Export backup and Export for Anki: the file should appear in Downloads (Files app → Downloads).
- Capture: take a photo, pick an image, read text.
- The bottom sheet with the keyboard open (pick a word on the answer side of a card).
- Anything that looks cut off at the top or bottom of the screen.
- Listen: does it speak? If not, does the settings button open the right screen, and does Check again find the voice after you install Japanese?
- Long-press a Japanese word in a browser or chat app: is Goi in the menu, and does Capture open with the text? Then Back: does it return to where you were in Goi?
- Share a selection or a web page to Goi from the share sheet.
- More → Updates → Check for updates: it should say you have the latest version.
- Capture a photo of Japanese text: is the result better than before? Does it read vertical text?
- Folder backups: choose a folder, make a change (add a card), wait half a minute, then look in the folder with the Files app. Leaving the app also triggers a backup.

## Known gaps in this build

- Sharing an **image** (a screenshot) to Goi isn't supported yet; open it from Capture instead.

## Keep the signing key safe

Updates install over this version only if they are signed with the same key. If the key were lost, the next version could only be installed after uninstalling, which deletes the app's data. Keep exporting backups.
