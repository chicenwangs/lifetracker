# Card 13 · feat: voice note (Android)

- Source: BREAKDOWN PR 13 (lines 99–104) · PLAN §1b (line 51), §3 Capture (lines 149–155), §5 item 10 (line 186), §7 item 8 (line 240), §8 PR 13 (line 270) · DESIGN §1.5 (lines 47–50, board M-V1) · decisions O-1 item 8, O-7, O-8
- Needs: — · Size: S–M · Branch: `v4/13-voice-note`

## What

A mic button in the Android app's Keep note composer turns speech into text and appends it at the cursor. The web build has no button and no permission path. The APK gains the `RECORD_AUDIO` permission, asked on the first tap behind a short in-app rationale; the release notes must name the permission.

Owner decisions that apply: **O-1** item 8 (build the plugin; release notes mention `RECORD_AUDIO`) · **O-7** (permission rationale, sentence 2 verbatim: "Speech is turned into text by Android's speech service, on your phone when it can.") · **O-8** (the owner does one real-phone dictation test before release; the card and PR never claim dictation works; MAIN writes `NEEDS_REAL_PHONE: voice dictation` in PROGRESS).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 New `Speech.java` in the app package is a Capacitor plugin (`@CapacitorPlugin(name = "Speech")`) with one method `listen({ preferOffline?: boolean })` resolving `{ text }`; it uses `SpeechRecognizer` with `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` + `EXTRA_LANGUAGE_MODEL`, sets `RecognizerIntent.EXTRA_PREFER_OFFLINE = true` when `preferOffline` is true, and never writes audio to disk, never uploads it and never calls the server (BREAKDOWN line 100; PLAN line 153 "Text only, nothing stored"). A recognition error rejects the call so the web side can report it.
- C2 `mobile/android/app/src/main/AndroidManifest.xml` gains `<uses-permission android:name="android.permission.RECORD_AUDIO" />`; the plugin declares a microphone permission alias with short in-app strings in `res/values/strings.xml`; `MainActivity.onCreate` registers the plugin beside `UpdaterPlugin`/`HapticsPlugin`/`ThemeBarsPlugin`/`SessionPlugin` (`MainActivity.java:25-28`); the Android build in the gate compiles.
- C3 `app/src/lib/client/native.ts` gains a `Speech` plugin type + accessor next to `updater()`, and `app/src/lib/client/speech.ts` (new, pure, no Svelte) exposes `canDictate()` = `isApp()` **and** the plugin exists, `dictate()` = `listen({ preferOffline: true })` returning the text, and a pure `toastFor(err)` returning `{ kind: 'info', text }` for the plugin's `no_service` and `permission` codes and `{ kind: 'error', text }` for anything else; `dictate()` shows it (`showToast` for info, `showError` for error). A unit test with a fake `globalThis.Capacitor` (same pattern as `app/tests/unit/haptics.test.ts`) proves: app + plugin → true, app without plugin → false, browser → false, `dictate()` passes `preferOffline: true`, and `toastFor` maps the three cases.
- C4 Web: no mic button, no rationale sheet and no microphone code path on `/keep` in a browser; a desktop e2e with the plugin absent sees no mic in the note editor.
- C5 App UI: in the Keep note editor of a text note, a 48 dp mic button sits right of the body field (DESIGN §1.5 line 48, board M-V1). Idle = outline mic with the accessible name "Speak note". Listening = filled mic with a pulsing ring and the placeholder "Listening…". A second tap stops listening and whatever text has arrived is kept (BREAKDOWN line 102 "Tap again = stop").
- C6 First tap in a session shows the in-app rationale sheet **before** Android's permission dialog: the leading line "Life Tracker only listens while this button is on." then O-7's sentence verbatim, buttons `Continue` and `Not now` (D-V4-20; DESIGN line 49). `Not now` closes the sheet and requests nothing; Android's own dialog appears only after `Continue`.
- C7 Permission: after a denial the mic renders greyed (DESIGN line 50) but is never disabled — every tap still calls `listen()`, so a grant made in Android settings works on the next tap without a reload. A `permission` rejection (RECORD_AUDIO denied) shows the toast "Microphone is off for Life Tracker. Turn it on in Android settings.". The in-app rationale sheet is shown only on the first tap of a session and is never re-opened after a denial.
- C8 Result handling: the recognised text is inserted at the caret in the body (selection start/end preserved, no text replaced), and the note then saves through the existing Keep autosave path (`KeepNote.svelte:83-130`); an empty result (`NO_MATCH`, `SPEECH_TIMEOUT`, zero words) leaves the note unchanged and the button idle.
- C9 Heard text and the listening state are never shown on a note opened with `shared === 'view'` (the mic is not rendered there).
- C10 Phone path: the mic is ≥ 48 dp, the rationale sheet uses `BottomSheet.svelte` with `use:backCloses`, Back closes the sheet before the note; no "Click"/"Ctrl"/"Esc"/PC wording in the mic, the sheet or its accessible names; `expectTargets48` and `noDesktopHints` pass on the open note (DESIGN §0 lines 11, 15).
- C11 Undo: dictation only types into a note; the note's existing autosave/revision path stays the only writer and no server mutation is added, so there is no new undo entry and no toast. The note's own text undo applies.
- C12 States (DESIGN §3): loading = the pulsing "Listening…" state, no spinner; empty = no speech → note unchanged; error = `listen()` rejects with a named `code`: `no_service` (no speech recognizer on the phone) becomes the fixed toast "Speech isn't available on this phone." (D-V4-20), `permission` becomes the C7 toast, and every other rejection goes to the existing `showError`; the button returns to idle in every case; offline = dictation still runs (on-device when available) and the note keeps the existing "Offline · kept on this device, sends when you're back" state.
- C13 The plugin and its JS bridge are checked by the gate's Android build and the unit test only: no APK is installed on a phone or emulator (SPRINT §1.4 line 26), and the PR body carries `NEEDS_REAL_PHONE: voice dictation` (O-8).
- C14 Docs: `mobile/README.md` (what the app adds + the microphone permission), `docs/SERVICE-HANDOFF.md` (the APK now asks for `RECORD_AUDIO`; PLAN §5 item 10), `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§5, K-NOTE row: mic, app only). The v4.0.0 release-notes paragraph is card R1's and must name the permission (O-1 item 8).

## Out of scope

- The web / Chrome Web Speech API (PLAN line 154: audio would leave the phone).
- Keeping audio, transcripts, history, a "dictation" note type, or sending speech to the server.
- Translation, language pickers, punctuation commands, continuous dictation across notes.
- Any change to `KeepNote`'s save path, offline queue, title field or checklist rows.
- Widgets, share-target and the shortcut that open `/keep?new`.

## Files likely touched

- `mobile/android/app/src/main/java/io/github/chicenwangs/lifetracker/Speech.java` (new)
- `mobile/android/app/src/main/java/io/github/chicenwangs/lifetracker/MainActivity.java` (`registerPlugin` block, lines 25–28)
- `mobile/android/app/src/main/AndroidManifest.xml` (permissions block, end of file)
- `mobile/android/app/src/main/res/values/strings.xml` (permission strings)
- `app/src/lib/client/native.ts` (plugin types, `isApp` line 20)
- `app/src/lib/client/speech.ts` (new)
- `app/src/lib/components/KeepNote.svelte` (body textarea line 521, phone top/bottom bars 462–505 / 734–751, `.body` styles 876–882 and 1132+)
- `app/src/lib/components/BottomSheet.svelte` (read-only: the rationale sheet)
- `app/tests/unit/v4-13-speech.test.ts` (new), `app/tests/unit/haptics.test.ts` (pattern)
- `app/tests/e2e/v4/13-no-mic-web.spec.ts` (new), `app/tests/e2e/phone/v4-13-no-mic-web.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (`noDesktopHints`, `expectTargets48`)

## Tests

- Builder: unit bridge mock (`canDictate` three cases, `preferOffline: true`, `toastFor`'s three mappings) in `app/tests/unit/v4-13-speech.test.ts`; desktop e2e "no mic in a browser" in `app/tests/e2e/v4/13-no-mic-web.spec.ts`; phone e2e the same on the phone note screen in `app/tests/e2e/phone/v4-13-no-mic-web.spec.ts`. The Android side is compiled by the gate's Android step; there is no browser test for dictation itself (O-8).
- Blind (tester, from Done when only): `app/tests/unit/v4-13-blind.test.ts`, `app/tests/e2e/v4/13-blind.spec.ts`, `app/tests/e2e/phone/v4-13-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§5), `docs/SERVICE-HANDOFF.md` (Android permissions), `mobile/README.md`; the v4.0.0 release notes are card R1's.

## Decided

- Decided: D-V4-20 — rationale line "Life Tracker only listens while this button is on." + O-7's sentence; no device check (SPRINT §1.4) — `NEEDS_REAL_PHONE: voice dictation`; mic on text notes only; `lib/client/speech.ts` resolves once with the final text; no speech service → fixed toast "Speech isn't available on this phone."
