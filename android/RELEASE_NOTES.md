First Android build of Goi. It is the same app as the website, installed from this file instead of the browser, and it works with no connection at all: the dictionary and the text recogniser are inside the APK.

## Install

1. Download `goi-1.1.0.apk` below on the phone (if the repository is private, be logged in to GitHub in the browser).
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

## Known gaps in this build

- **Listening mode and the speaker buttons have no voice.** Android's WebView has no speech; native speech comes in the next build.
- **Folder backups** are not available yet; automatic backups go to Downloads.
- No "Share to Goi" or text-selection entry yet; also next build.

## Keep the signing key safe

Updates install over this version only if they are signed with the same key. If the key were lost, the next version could only be installed after uninstalling, which deletes the app's data. Keep exporting backups.
