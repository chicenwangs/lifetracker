# Life Tracker — Android app

Caveman doc. Capacitor 8 shell. The app = the server's own pages (`server.url` in `capacitor.config.json`) in a WebView, plus native bits the web can't do.

## What it adds
- **Widgets (6):** Today timeline (scrolls to now, tick in place, + quick add) · Keep (scrolling note cards, + new note bottom-right) · Now and next (time left bar) · Quick add (+ Plan / + Note) · Countdowns (days left) · Week ahead (7 days). App look, Light / Dark / Auto from the account. `docs/v2/UX-MOTION-AUDIT.md` has what each is for.
- **Reminder alarms:** web push needs Chrome; the app sets an exact alarm per reminder instead. No Firebase.
- **In-app update:** on open (max every 6 h) and in Settings › Help › Check for updates. Downloads `life-tracker-X.Y.Z.apk` from the newest GitHub Release and opens Android's installer. First time Android asks to allow installs from Life Tracker.
- **Voice note (card 13, app only):** a 48 dp mic right of the Keep note body turns speech into text (Android's `SpeechRecognizer`, `EXTRA_PREFER_OFFLINE` when it can) and types it at the caret; the note saves through its normal autosave, and Ctrl+Z in the field removes the dictated words. Text only: nothing is recorded, stored, uploaded or sent to the server, and the web build has no mic. The APK asks for `RECORD_AUDIO` on the first tap of a session, after an in-app rationale (the sheet is the one copy). Denied = greyed mic that still tries on every tap.
- Back button = page back. Attachment downloads go to Downloads. Offline at start = `www/offline.html`.

## How it works
- `SyncWorker` every 15 min + when the app goes to the background: `GET /api/native` with the WebView's session cookie → cache → redraw widgets → reset alarms (next 48 h).
- Server does all the logic (`app/src/lib/server/native.ts`): owner timezone, hidden types, colours, order, reminder kinds on/off. Native only draws strings.
- Pages update by themselves (they come from the server). Only native code changes need a new APK.
- Version = `app/package.json` (2.0.3 → versionCode 20003). Updater compares the release tag with it.

## Files
- `android/app/src/main/java/.../` — `MainActivity` (back, downloads, deep links, permission), `Native` (GET/PATCH + cache), `SyncWorker`, `Reminders` (+ `Boot`), `Widgets` (6 providers + renderers), `WidgetAction` (list taps: open / tick), `Theme`, `Updater` + `UpdaterPlugin` (`window.Capacitor.Plugins.Updater`).
- `res/layout/widget_list.xml` (shared frame) + `item_*.xml` (rows), `widget_now.xml`, `widget_quick.xml`, `xml/widget_*_info.xml`, `drawable/w*.xml`.
- `src/test/.../WidgetShotsTest.java`: draws every widget light + dark → CI artifact `widget-shots` (look at it after widget changes).
- Server URL is in two places: `capacitor.config.json` and `res/values/strings.xml` (`server_url`). Change both.

## Build + release
- CI (`ci.yml` job `apk`): unsigned release build on every PR = compiles + release lint.
- Release (`release.yml` job `apk`): tag `vX.Y.Z` → signed `life-tracker-X.Y.Z.apk` attached to the GitHub Release.
- Signing key: `C:\Users\<you>\.lifetracker-android\release.p12` + `password.txt` on the dev PC. **Back it up** (password manager). Lose it = no more updates over the installed app (uninstall + reinstall).
- Repo secrets (once): `ANDROID_KEYSTORE_B64` (base64 of `release.p12`), `ANDROID_KEYSTORE_PASSWORD`. Missing = release still ships, just without an APK (warning in the run).
- Local build (needs JDK 21 + Android SDK): `npm ci && npx cap sync android && cd android && ./gradlew assembleDebug`.

## Local emulator (dev) — verified 2026-11-17
Debug APK on the emulator, pointed at a local dev server. Checked end to end: boot → install (4.4 MB) → sign-in page in the WebView → login → Today (phone layout, week strip, Now card, blocks) → reminder sheet (Done / Snooze 10 min / Tomorrow, #112) → bottom bar Today · Calendar · + · Keep · Pages.
Not checked on the emulator yet: gestures, sheets, offline, widgets, shortcuts, notification actions.

| Thing | Value |
|---|---|
| Emulator | AVD `lt_pixel7`, Android 16 / API 36 → `emulator-5554` |
| Server | `mobile-dev` in `.claude/launch.json`: `127.0.0.1:5176`, `data/phone-dev.db` (seed: `cd app && npm run db:seed:phone`; login in `data/TEST-LOGIN.txt`) |
| Tunnel | `adb reverse tcp:5176 tcp:5176` |
| APK | `mobile/android/app/build/outputs/apk/debug/app-debug.apk` |
| JDK | `JAVA_HOME=C:\Program Files\Java\jdk-24` worked (Android Studio `jbr` also fine, QA loop uses it) |

**Why localhost + adb reverse, not 10.0.2.2:** service worker, offline queue and push need a secure context. `http://localhost` is one; `http://10.0.2.2` is not → SW silently doesn't register. `adb reverse` makes the emulator's `localhost:5176` = PC's `5176`.

Steps:
1. Server: start `mobile-dev` (or in `app/`: `$env:ORIGIN='http://localhost:5176'; $env:DATABASE_PATH='../data/phone-dev.db'; npm run dev -- --host 127.0.0.1 --port 5176 --strictPort`).
2. Emulator: boot `lt_pixel7`, wait for `adb shell getprop sys.boot_completed` = 1.
3. `adb reverse tcp:5176 tcp:5176`
4. Build pointed at local (temporarily — see rules): `server.url` → `http://localhost:5176`, then `cd mobile && npx cap sync android && cd android && .\gradlew assembleDebug`.
5. `adb install -r <APK>` and open Life Tracker.

Rules:
- **Don't commit the local URL.** Swap `server.url` only for the build, then put it back + `npx cap sync android` (same as `qa/qa-night.ps1` §3). The installed APK keeps the local URL baked in, so restoring the file doesn't break the session.
- **Cleartext http:** only via `android/app/src/debug/AndroidManifest.xml` (debug builds). Never add `usesCleartextTraffic` to `src/main` — it would ship in release.
- `res/values/strings.xml` `server_url` is not swapped → widgets / alarms / `SyncWorker` still talk to prod. Local check covers the WebView only.
- One emulator, one package: the QA loop (`docs/v3/QA-LOOP.md`, port 4174) reinstalls the same app pointed at 4174. Run one or the other, not both.

| Problem | Fix |
|---|---|
| App shows "Can't reach Life Tracker" | tunnel gone (adb restarted / emulator rebooted) → `adb reverse tcp:5176 tcp:5176` before assuming a bug |
| SW / offline / push not working | URL is `10.0.2.2` or an IP → must be `http://localhost:5176` |
| Page loads but is the QA data / other server | QA loop replaced the APK → rebuild + reinstall |
| Every POST 403 | server `ORIGIN` ≠ `http://localhost:5176` |

## Limits
- shortcut: widget "now" uses the phone's clock and timezone; server day uses the account timezone. Same zone = fine.
- Alarms only cover reminders the phone has synced (every 15 min, next 48 h). One made on the PC 5 min before it's due may be missed by the phone; it still shows in-app.
- Chrome push on the same phone too = you may get both. Turn push off in Chrome if you use the app.
