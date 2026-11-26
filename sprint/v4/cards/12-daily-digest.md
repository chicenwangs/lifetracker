# Card 12 · feat: daily digest

- Source: BREAKDOWN PR 12 (lines 92–97) · PLAN §3B (lines 89–92), §5 item 1 (line 177), §7 item 5 (line 237), §8 PR 12 (line 269) · DESIGN §1.4 (lines 42–45, board D-N1) · decisions O-1 item 5, D-V4-13, D-V4-19, D-V4-30, D-V4-37
- Needs: 05, 08 · Size: M · Branch: `v4/12-daily-digest`

## What

One notification a day with that day's plan: "4 items · 2 blocks · first 09:00". Settings › Notifications gets Off / On + a time (default 07:30, stored in `users.digest_time`, NULL = off). The web job sends once per local day through the existing push queue; the Android app gets the next digest instant and that day's text from `/api/native` and sets one exact alarm on the reminders channel. The text always describes the local date it is for: today for the web push and the preview, the date of `at` for the Android alarm. Nothing on the day, `notify_planner` off, or no digest time = no notification.

Owner decisions that apply: **O-1** item 5 (counts are that day's items + planner blocks; no slipped count, no partner items; the text is "4 items · 2 blocks · first 09:00"), **D-V4-13** as amended by **D-V4-19** (mark only after a real send) and **D-V4-30**.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Settings › Notifications has a `Daily agenda` row: segmented `Off | On` and, when On, a time field; the first switch to On sends `07:30` from the client (no server-side default write), and the helper reads "One notification a day with today's items and blocks. Nothing on → no notification." Below it, a preview chip with today's real text ("4 items · 2 blocks · first 09:00"), rendered once by the server for the signed-in user — not live (D-V4-30; DESIGN §1.4 lines 43–45 amended from "live"), or "Nothing on today." when the day is empty.
- C2 On saves `users.digest_time` = `HH:MM`; Off saves `NULL`. `PATCH /api/me/prefs` accepts `digestTime` validated by the existing strict `HH:MM` rule (`zTime`), `SafeUser` exposes `digestTime` (`app/src/app.d.ts:4-29`), and no new table is added.
- C3 `digestText(me, date)` counts that local date's **own** items and planner blocks: items from `agenda(me, date, addDays(date, 1))` that are top-level and not `done` (all-day and `on_calendar = 0` types included, `hidden_types` excluded by `agenda`), each counted once — a multi-day item and a repeat occurrence that overlaps the day are one row — plus that day's own planner blocks, each counting for the day it starts — a block that began the night before is not counted again (D-V4-37); it never counts partner/shared items, Slipped items, steps or other days. A day with nothing on sends no notification and the preview says "Nothing on today." (D-V4-13, D-V4-30).
- C4 One `digestText(me, date)` function serves the settings preview (today), the web push (today) and the Android payload (the local date of `digest.at`, which is today when the digest time is still ahead and tomorrow otherwise, D-V4-30). "first HH:MM" is the earliest of any timed item's `time` and any block's local start on that date; it is omitted when the day has only all-day items (D-V4-13).
- C5 Web job: `jobs.tick()` (`app/src/lib/server/jobs.ts:131-186`) considers a user only when `digest_time` is set, local time ≥ `digest_time`, `notify_planner` is on, that local date is not marked in `app_meta` (one `digest_sent` key per user + local date, BREAKDOWN line 95) and the day has something on, then calls `pushTo`. The date is marked **only** when `pushTo` returned `sent >= 1` (a live subscription took it) and only when all those send conditions passed (D-V4-19, D-V4-30). With no live subscription (`sent = 0`) the date stays unmarked, so `/api/native` can still set the Android alarm and there is no push to repeat; a `failed` send is logged, leaves the date unmarked, and the next tick retries; a marked date is never sent again. The same tick purges digest `app_meta` keys whose date is older than a day. `jobs.start()` keeps the tick interval from `REMINDER_POLL_INTERVAL_MS`.
- C6 The push payload is title = the digest text, no body, route `/today` (D-V4-13; `pushTo`, `jobs.ts:79-126`), sent to the user's devices through the existing host allowlist; a push failure is logged without throwing; the digest never creates a `reminders` row or an in-app undo entry.
- C7 Android: `/api/native` returns `digest: { at, text }` — `at` is the next local `digest_time` as a valid UTC ISO (`zIsoZ`): today's time when it is still ahead, else tomorrow's; `text` is `digestText` for `at`'s local date — and `digest: null` when `digest_time` is NULL, `notify_planner` is off, that date is already marked in `app_meta` (the web push handled it, D-V4-13), or that date has nothing on. A local date the web job already marked is therefore not also sent by the app.
- C8 `Reminders.java` gains exactly one digest alarm path on the existing `reminders` channel (no Done/Snooze/Tomorrow actions) under the fixed alarm id `digest`, set from `digest.at` with the text; tapping opens `/today`. `SyncWorker` passes the `digest` object into `Reminders.schedule` on every run (`SyncWorker.java:40`), so the id is re-added to its `alarms` set each sync — `schedule` cancels every id missing from the new list (`Reminders.java:59`) and `Reminders.Boot` clears the whole set (`Reminders.java:204-212`), so a sync that did not re-add `digest` would lose the alarm; whenever the digest is on, `digest.at` is part of that sync. A reboot / app update reschedules it through `Reminders.Boot` → `SyncWorker.now`. An item added after the alarm was computed appears on the next 15-minute sync; that window is accepted (D-V4-13). The code is verified by the Android build and the payload unit test; there is no emulator/device check (SPRINT §1.4) and PROGRESS carries `NEEDS_REAL_PHONE: daily digest alarm` (D-V4-13).
- C9 Unit "due now?": at 23:50 with 07:30 the digest is not due; at 07:30 it is; at 00:05 the next local day is due again; a local date already marked (a web push actually went out) is not sent again that day; a failed send or a date with no live subscription leaves it unmarked and due; changing the user's timezone moves the check; a DST transition day still sends once per local date (BREAKDOWN line 97, D-V4-13, D-V4-30).
- C10 Phone path: the `Daily agenda` row and its segmented control / time field are ≥ 48 dp on the phone Notifications page, no "Click"/"Ctrl"/key-hint copy, Back returns to the Settings list, and the preview chip wraps without horizontal scrolling.
- C11 Undo: changing `digest_time` writes a `users` column, which the undo journal excludes (`app/src/lib/server/undo.ts:11`), so there is no undo toast; Off is the reversal. No planner data is touched.
- C12 States (DESIGN §3): loading = the page is server-rendered with the preview, no extra spinner; empty = the day has nothing → "Nothing on today." and no push; error = a failed save uses the page's existing `showError`/toast path (`notifications/+page.svelte:68-76`) and the control returns to the stored value; offline = the root layout's offline badge is already shown (`app/src/routes/+layout.svelte:142`), the save fails with the usual error toast and nothing is queued (preferences are not in the offline queue).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§9 reminders, §10 mobile), `docs/SERVICE-HANDOFF.md` (the job now also sends a daily digest; no new outbound host, no new env var; the Android section notes `/api/native` gains `digest`), `docs/v4/DESIGN.md` §1.4 (the preview is server-rendered once, not live).

## Out of scope

- A digest for Slipped, Keep, pages or partner items (O-1 item 5).
- Quiet hours, a per-day-of-week schedule, multiple digests a day, or a digest time per device.
- Push permission UI changes, web push on Android via FCM, or a new notification channel.
- In-app toast/inbox copies of the digest.
- A database table: the dedupe stays in `app_meta`.

## Files likely touched

- `app/src/routes/settings/notifications/+page.svelte` (new row, segmented control, time, preview)
- `app/src/routes/settings/notifications/+page.server.ts` (new: server-rendered preview from that day's `agenda`)
- `app/src/routes/api/me/prefs/+server.ts` (schema + `Prefs`; lines 21–48)
- `app/src/lib/server/repo/users.ts` (`safe()` 12–39, `Prefs` 100–113)
- `app/src/app.d.ts` (`SafeUser.digestTime`)
- `app/src/lib/server/schema.ts` (`users.digestTime`, card 08)
- `app/src/lib/server/jobs.ts` (`tick` 131–186, `pushTo` 79–126)
- `app/src/lib/server/digest.ts` (new: `digestText`, due-now, next-at; pure-ish, server)
- `app/src/lib/server/agenda.ts` (new in card 05)
- `app/src/lib/server/native.ts` (return object 109–119)
- `app/src/lib/server/repo/meta.ts` (`get`/`set`; digest keys + purge)
- `app/src/lib/time.ts` (`todayLocal`, `nowLocalMinutes`, `localToUtc`, `addDays`)
- `mobile/android/app/src/main/java/io/github/chicenwangs/lifetracker/Reminders.java` (`schedule` 36–61, `channel` 90–95, `Boot` 204–213)
- `mobile/android/app/src/main/java/io/github/chicenwangs/lifetracker/SyncWorker.java` (line 40 after `Reminders.schedule`)
- `app/tests/unit/native.test.ts`
- `app/tests/unit/v4-12-digest.test.ts` (new), `app/tests/e2e/v4/12-digest.spec.ts` (new), `app/tests/e2e/phone/v4-12-digest.spec.ts` (new)

## Tests

- Builder: unit "due now?" across timezone, midnight, a marked date, a failed send, no subscription and a DST day; the text counts (including a multi-day span, a repeat occurrence counted once, and a midnight-crossing block counted only on its start day) and `digest.at`/`text`/null in `app/tests/unit/v4-12-digest.test.ts`; unit native payload in the same file and `app/tests/unit/native.test.ts`; desktop e2e set On 07:30 → the preview text matches today's items/blocks → Off clears it in `app/tests/e2e/v4/12-digest.spec.ts`; phone row + 48 dp in `app/tests/e2e/phone/v4-12-digest.spec.ts`. The web push itself is asserted through `pushTo`'s returned counts / a mocked push and the `app_meta` mark, not a real push service; the Android alarm is covered by the Java build and the payload unit test.
- Blind (tester, from Done when only): `app/tests/unit/v4-12-blind.test.ts`, `app/tests/e2e/v4/12-blind.spec.ts`, `app/tests/e2e/phone/v4-12-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§9, §10), `docs/SERVICE-HANDOFF.md` (job behaviour + `/api/native` field), `docs/v4/DESIGN.md` §1.4 (preview not live).

## Decided

- Decided: D-V4-13 — "first" = earliest of timed items and block local starts; exclude done items; push title = the digest text, no body; the web job marks user+date as attempted once per day and `/api/native` skips a date already marked; accept the 15-minute sync window; no emulator check (SPRINT §1.4) — `NEEDS_REAL_PHONE: daily digest alarm`; count items and blocks as written.
- Decided: D-V4-19 — marking happens only when a digest push was actually sent to a live subscription; with no subscription the date stays unmarked so `/api/native` can still set the Android alarm. This replaces D-V4-13's "subscription or not".
- Decided: D-V4-30 — mark only after a successful send **and** only when the send conditions passed; the text describes the local date of `at`; counts come from `agenda` over that day; the digest alarm id is re-added on every sync; "Nothing on today." + a server-rendered preview; the "same row on Android" clause is dropped; the client sends `07:30` on the first On; digest meta keys older than a day are purged in the tick; a push failure is logged and retried on the next tick.

- Decided: D-V4-37 — a planner block counts for the local day it starts, so a block that began the night before is not counted twice; the text and "first HH:MM" use the same rule.
