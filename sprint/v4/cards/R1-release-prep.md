# Card R1 · chore: release prep v4.0.0

- Source: BREAKDOWN "Gate v4.0" (line 218) · PLAN §8 "v4.0 — Pages overhaul" gate (line 297) · AGENTS.md §What this is (line 9), §Current state (lines 65–66), §Known issues (lines 70–74) · BOARD R1 · decisions O-1 (item 8: voice/RECORD_AUDIO), O-2 (one release v4.0.0), O-8 (no voice claim before the owner's phone test) · no DESIGN section of its own: the notes describe the screens built from DESIGN §1–2 and add no behaviour
- Needs: all (cards 00–31 + every merged `F-` fix) · Size: M · Branch: `v4/R1-release-prep`

## What

Release prep for the one **v4.0.0** release (O-2): set the version, write the release notes, and make every current-state doc true. R1 **never tags, never releases, never deploys** — the owner tags `v4.0.0` and deploys (SPRINT §1.1–1.2, AGENTS.md first section). The release holds the v3.2 + v3.3 + v4.0 work in one go (O-2); R1 does not create v3.2/v3.3 tags.

Owner decisions that apply: **O-1 item 8** (the notes mention the new `RECORD_AUDIO` permission), **O-2** (one v4.0.0 release, not three), **O-8** (no claim that voice dictation works until the owner's real-phone test). The `O-` and `D-V4-` lists are the source for PRD §12 (DECISIONS.md line 4).

## Done when

- C1 Version: `app/package.json` `"version"` = `4.0.0`; the two root `"version"` fields in `app/package-lock.json` = `4.0.0`; `deploy/.env.example` `APP_VERSION=4.0.0`. `mobile/android/app/build.gradle` still derives both Android values from `app/package.json` (lines 3–5) with no hard-coded version: `versionName` = 4.0.0 and `versionCode` = 40000 (4×10000 + 0×100 + 0). The release workflow's tag check (`.github/workflows/release.yml:94`) will compare `app/package.json` with `v4.0.0` and match.
- C2 Release notes: `docs/v2/RELEASE-NOTES.md` gains a `## v4.0.0` section above `## v3.1.2`, in the old sections' shape: upgrade paragraph (back up first, `APP_VERSION=4.0.0`, migrations **0011 + 0012** run on first boot, `/healthz` → `"version":"4.0.0"`, rollback = the pre-upgrade backup because migrations are forward-only, APK on the release), then one bullet per **user-visible** feature in BREAKDOWN PRs 1–31 grouped by area: Keep trash restore · phone hint copy · planner actions + Slipped · print week · ICS feed · repeat from completion · Month calendar type flag · ICS import · daily digest · voice note · type starter pack · page icon · duplicate · callout/toggle/TOC · `[[` links · backlinks · local graph · templates + starter templates · DB board/calendar/gallery · Markdown import/export · block handles · to-do reminders · cover. Every merged `F-` fix is included. The internal-only refactor (PR 5) is not presented as a feature.
- C3 Microphone: `mobile/android/app/src/main/AndroidManifest.xml` declares `android.permission.RECORD_AUDIO` (added by card 13); the notes name it in plain language for the Android app only, using O-7's sentence ("Speech is turned into text by Android's speech service, on your phone when it can.") and D-V4-20's "Life Tracker only listens while this button is on."; they say the web app has no mic button (BREAKDOWN PR 13 line 102). They do not claim the owner's real-phone dictation test passed; PROGRESS carries `NEEDS_REAL_PHONE: voice dictation` (O-8).
- C4 PRD §12: `docs/v2/PRD.md` §12 gains exactly one row per `O-` and `D-V4-` decision in `sprint/v4/DECISIONS.md` at merge time (currently 61: `D-25`–`D-36` = `O-1`…`O-12` in order, `D-37`–`D-85` = `D-V4-01`…`D-V4-49` in order — 49 sprint decisions). Each row is one line with the source id, the choice and the card(s); the closing summary paragraph (like line 170) lists them. No id is skipped or reused; `D-V4-19` says it amends `D-V4-13` and `D-V4-26` amends `D-V4-09`.
- C5 AGENTS.md: line 9 says the latest release is v4.0.0 (owner tags), `app/package.json` = 4.0.0; §Current state records the v4.0.0 scope and migrations 0011 + 0012; the test counts on line 66 match the latest `gate.ps1 -Mode site` result file that covers the R1 HEAD (R1's own site gate, or the S3 site gate on `main` when the HEAD is docs-only); the PR body names that file. §Known issues keeps only bugs that are still real after the merged cards (card 21 removes the graph "no width" item; the theme midnight hazard and the stale service-worker note stay unless their fix merged), with the list re-dated.
- C6 CLAUDE.md: the "Now" block says latest release = v4.0.0 (tag + deploy = owner), last migration = 0012, test counts match the same site gate file, and the v4 sprint block reflects the real state (cards merged, S3 verify loop, `READY for v4.0.0` only when SPRINT §3 says so); the release/deploy ownership line is unchanged. No line still calls v3.1.2 current.
- C7 BUILD-NOTES + FEATURES: `docs/BUILD-NOTES.md` gets a `## v4.0.0` section at the top covering the same feature set as C2, newest first, and its header line says v4.0.0. `docs/v2/FEATURES.md` describes the new v4 behaviour in its existing sections; `PG-VIEWS` (line 122) and `PG-TEMPLATE` (line 129) are no longer `LATER`, board/calendar/gallery/templates are described as shipped, and no shipped feature is still marked `LATER`/planned. No section claims a feature the code does not have (code wins).
- C8 Docs sweep: `README.md` current-version line, version badge, test-count badge, Docker image line, APK name, deploy-bundle name and `APP_VERSION` line all say 4.0.0. `docs/HANDOFF.md` §Now and `docs/v2/PRD.md` line 9 say v4.0.0, and `docs/v2/PHASES.md` gains a v4.0.0 row (tag state per the open question). `docs/v2/CHAT-HANDOFF.md` keeps its superseded banner, and its latest-release line is handled as the open question decides. `docs/v3/QA-RUN-2026-11-23.md` and older release-note entries keep 3.1.2 (historical). A `grep` for `3.1.2` leaves only historical records, the superseded banner, `sprint/` and the unrelated npm `@jridgewell/resolve-uri` 3.1.2 in the lockfile.
- C9 SERVICE-HANDOFF: `docs/SERVICE-HANDOFF.md` §5 gains "v3.1.2 → v4.0.0: migration 0011 + 0012, back up first, rollback = restore the backup"; §1/§3/§8 name the public unauthenticated `GET /cal/<token>.ics` (rate-limited, read-only, no new outbound calls), the digest job (web push to the existing push services + Android alarm) and the Android-only `RECORD_AUDIO` permission. §State keeps the last real live verification (v3.0.0, 2026-11-19) and says v4.0.0 is not deployed; no line claims a live upgrade.
- C10 No tag/release/deploy: the R1 branch/PR contains no git tag, no GitHub Release, no GHCR image push and no deploy; `git tag --points-at HEAD` is empty. The PR body says "owner tags `v4.0.0`" and quotes the site gate file (SPRINT §3, §7).
- C11 Phone path: R1 changes no `app/src` or `mobile/` UI file, so 48 dp, `BottomSheet`, `use:backCloses` and `noDesktopHints` are untouched; the same site gate file includes desktop, phone and phone-landscape e2e. The release notes name the phone paths shipped (Add sheet, status squares, Slipped strip, template picker) without desktop-only wording.
- C12 Undo: R1 adds no mutation and no undo entry. The release notes claim Undo only for actions whose card/test proves it (postpone, skip, bulk move, duplicate, from-template, icon change, ICS import, DB board/calendar moves) and do not claim Undo for note creation or any path that has none (PLAN §5 item 5; code wins).
- C13 States: no new screen, so DESIGN §3 states do not apply. The upgrade paragraph is the only state text: back up → set the new version → start; failure = the app does not start or `/healthz` 503; rollback = restore the backup (SERVICE-HANDOFF §5).
- C14 Sharing/permission claims in the notes match the code: ICS feed = own items only, private items = "Busy", no shared calendars (O-1 item 4); backlinks drop pages the viewer cannot open (card 20); a duplicate of a shared page belongs to the duplicator with no shares (card 17/D-V4-23); templates are searchable but out of the tree (D-V4-34). No new permission is claimed.

## Out of scope

- Any git tag, GitHub Release, GHCR push, deploy, live check or APK install (SPRINT §1.1–1.4). **Never tags, never releases, never deploys.**
- App code and migrations — cards 08/15 ship them; R1 only bumps the version and writes docs. No behaviour change here.
- The owner's real-data migration copy and real-phone voice test (PLAN §8 gate; O-8). R1 records them as `NEEDS_OWNER: migration 0011 + 0012 on a real-data copy` and `NEEDS_REAL_PHONE: voice dictation` in PROGRESS.
- Rewriting `docs/v4/BREAKDOWN.md`, `docs/v4/DESIGN.md` or `wireframes/v4/` (the feature cards own their DESIGN edits; R1 only sweeps current-state docs).
- Parked backlog (`docs/REVIEW.md`, v2.1) and any v4 idea not in BREAKDOWN.

## Files likely touched

- `app/package.json` (line 4, version)
- `app/package-lock.json` (root `version` at lines 3 and 9; line 1483 is the unrelated `@jridgewell/resolve-uri` package)
- `deploy/.env.example` (line 6, `APP_VERSION`)
- `mobile/android/app/build.gradle` (read-only: lines 3–5 derive the Android version from `app/package.json`)
- `mobile/android/app/src/main/AndroidManifest.xml` (read-only: assert `RECORD_AUDIO` from card 13)
- `docs/v2/RELEASE-NOTES.md` (new `## v4.0.0` section above line 3)
- `docs/v2/PRD.md` (§12 table after D-24 line 166; header line 9)
- `docs/v2/FEATURES.md` (`PG-VIEWS` line 122, `PG-TEMPLATE` line 129, and the sections listed in C7)
- `docs/BUILD-NOTES.md` (header line 4 + new top section)
- `AGENTS.md` (lines 9, 65–66, 70–74)
- `CLAUDE.md` (lines 7–13)
- `README.md` (lines 5, 7, 70–72, 85, 95)
- `docs/HANDOFF.md` (line 7; known issues at 85–89)
- `docs/SERVICE-HANDOFF.md` (line 5, §5 at 99–125, §8 at 169)
- `docs/v2/PHASES.md` (line 3 + status table after line 76)
- `docs/v2/CHAT-HANDOFF.md` (line 1 banner)
- `.github/workflows/release.yml` (read-only: tag/version check at line 94)

## Tests

- Builder: no app code and no new e2e; the card's checks are commands a reviewer runs (`node -p`, `npm` lock check, `grep`, `git tag --points-at HEAD`). The gate on the R1 HEAD is the existing suite: `gate.ps1 -Mode site` (SPRINT §3), and its result file is the only test-count source.
- Blind (tester, from Done when only): none new — the tester re-runs C1–C14 and reports each; a docs/version diff has no UI to test. The site gate file and `git tag --points-at HEAD` are the evidence.

## Docs

- The docs are the deliverable: `docs/v2/RELEASE-NOTES.md`, `docs/v2/PRD.md`, `docs/v2/FEATURES.md`, `docs/BUILD-NOTES.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/HANDOFF.md`, `docs/SERVICE-HANDOFF.md`, `docs/v2/PHASES.md`, `docs/v2/CHAT-HANDOFF.md`, `deploy/.env.example`.

## Decided

- Decided: D-V4-38 — R1 merge is the release point: version 4.0.0 in `app/package.json` (Android derives versionName/versionCode), RELEASE-NOTES dated 2026-11-26 saying latest = 4.0.0, the owner tags; voice note described with the `RECORD_AUDIO` permission and no "works" claim, `NEEDS_REAL_PHONE: voice dictation` stays; CHAT-HANDOFF latest release becomes v4.0.0; `build.gradle` keeps deriving from `package.json`.
