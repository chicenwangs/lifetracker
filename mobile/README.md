# Life Tracker — Android app

Caveman doc. Capacitor 8 shell. The app = the server's own pages (`server.url` in `capacitor.config.json`) in a WebView, plus native bits the web can't do.

## What it adds
- **Widgets:** Today timeline (from now on, 6 rows, colour bar per type, `+` = quick add) and Keep (8 newest/pinned notes, tap = open note, `+` = new note). Resizable.
- **Reminder alarms:** web push needs Chrome; the app sets an exact alarm per reminder instead. No Firebase.
- **In-app update:** on open (max every 6 h) and in Settings › Help › Check for updates. Downloads `life-tracker-X.Y.Z.apk` from the newest GitHub Release and opens Android's installer. First time Android asks to allow installs from Life Tracker.
- Back button = page back. Attachment downloads go to Downloads. Offline at start = `www/offline.html`.

## How it works
- `SyncWorker` every 15 min + when the app goes to the background: `GET /api/native` with the WebView's session cookie → cache → redraw widgets → reset alarms (next 48 h).
- Server does all the logic (`app/src/lib/server/native.ts`): owner timezone, hidden types, colours, order, reminder kinds on/off. Native only draws strings.
- Pages update by themselves (they come from the server). Only native code changes need a new APK.
- Version = `app/package.json` (2.0.3 → versionCode 20003). Updater compares the release tag with it.

## Files
- `android/app/src/main/java/.../` — `MainActivity` (back, downloads, deep links, permission), `Native` (GET + cache), `SyncWorker`, `Reminders` (+ `Boot`), `Widgets` (`Timeline`, `Keep`), `Updater` + `UpdaterPlugin` (`window.Capacitor.Plugins.Updater`).
- `android/app/src/main/res/layout/widget_*.xml`, `xml/widget_*_info.xml`.
- Server URL is in two places: `capacitor.config.json` and `res/values/strings.xml` (`server_url`). Change both.

## Build + release
- CI (`ci.yml` job `apk`): unsigned release build on every PR = compiles + release lint.
- Release (`release.yml` job `apk`): tag `vX.Y.Z` → signed `life-tracker-X.Y.Z.apk` attached to the GitHub Release.
- Signing key: `C:\Users\<you>\.lifetracker-android\release.p12` + `password.txt` on the dev PC. **Back it up** (password manager). Lose it = no more updates over the installed app (uninstall + reinstall).
- Repo secrets (once): `ANDROID_KEYSTORE_B64` (base64 of `release.p12`), `ANDROID_KEYSTORE_PASSWORD`. Missing = release still ships, just without an APK (warning in the run).
- Local build (needs JDK 21 + Android SDK): `npm ci && npx cap sync android && cd android && ./gradlew assembleDebug`.

## Limits
- shortcut: widget "now" uses the phone's clock and timezone; server day uses the account timezone. Same zone = fine.
- Alarms only cover reminders the phone has synced (every 15 min, next 48 h). One made on the PC 5 min before it's due may be missed by the phone; it still shows in-app.
- Chrome push on the same phone too = you may get both. Turn push off in Chrome if you use the app.
