# Card 11 · feat: ICS file import

- Source: BREAKDOWN PR 11 (lines 83–90) · PLAN §3C (lines 120–124), §8 PR 11 (line 268) · DESIGN §1.3 (lines 32–40, board D-I1) · decisions O-1 items 2–3 (the chosen type and its Month visibility), D-V4-12, D-V4-29, D-V4-37
- Needs: 08, 10 · Size: L · Branch: `v4/11-ics-import`

## What

Settings › Import gets `Calendar file (.ics)`: upload a university timetable or a Google/Outlook export (≤ 1 MB), preview "N events · M repeating · K skipped" with a plain-words reason per skipped event, choose the type (default: the first type with `Month calendar` off, else None), then import as ordinary planner items. Re-importing the same file updates rows by their VEVENT UID instead of duplicating them, and the whole import is one Undo. One event is one item; no new dependency, no subscribed URL.

Owner decisions that apply: **O-1** items 2–3 (the import's default type is the one hidden on Month; the type's visibility rules already apply to the imported items); **D-V4-29** (duplicate UIDs, trashed rows, title limits, Windows TZIDs, inline preview, size re-check, UNTIL, undo, online state).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Settings › Import gets a `Calendar file (.ics)` section with a file input; a file over 1 000 000 bytes is refused before upload with an inline `.alert` in the preview area ("The file is over 1 MB."), never a toast. The server action re-checks the posted file part's size against the same 1 000 000 bytes and returns the same inline error, so a bypass is refused either by that check or by the app's 1 048 576-byte body cap (`app/src/hooks.server.ts:59`, 413) — nothing is written in either case.
- C2 A valid file shows the preview: the big line "N events · M repeating · K skipped", where N = importable events and K is counted separately and includes every duplicate-UID and no-UID event (D-V4-12, D-V4-29, D-V4-37), and the primary button's "Import N" is the same number; `Put them in type` (default = the first type in position order with `onCalendar = false`, else None), a `Skipped (K)` disclosure with one plain-words reason per skipped event ("Lab rota" — repeats by week number, not supported; "Clash" — duplicate UID), `Already imported: X will be updated` when UIDs match live rows in my calendar, a limit line stating how many titles were shortened (C3, only when that happened), and `Cancel` / `Import N` (DESIGN §1.3 lines 34–40).
- C3 The parser is our own small pure module: it unfolds folded lines (CRLF + space/tab), decodes `\\`, `\,`, `\;`, `\n`, walks `BEGIN:VEVENT` … `END:VEVENT`, and reads `UID`, `SUMMARY`, `DTSTART`, `DTEND`, `RRULE`, `EXDATE` with their `TZID` / `VALUE=DATE` / UTC parameters. It ignores `VTIMEZONE`, `VALARM`, `VTODO`, `VJOURNAL` and unknown properties; it never fetches anything. Within one file the **first** VEVENT with a given UID wins and every later one is skipped with the reason "duplicate UID" (D-V4-29); a VEVENT with no `UID` at all is skipped with the reason "no ID" (D-V4-37). An empty `SUMMARY` becomes "Untitled"; a title over 300 characters is truncated to 300 and reported in the preview (C2).
- C4 `DTSTART` becomes the item's local `date` + `time` in the **user's** timezone: a UTC `...Z` value and a known IANA `TZID` value are converted to the user's zone with `TZDate` from `@date-fns/tz` (`app/src/lib/time.ts:4`), a floating time (no `Z`, no `TZID`) is taken as the user's local time, `VALUE=DATE` becomes `time: null`. An unknown `TZID` skips that event with "unknown time zone — not supported"; Outlook's Windows zone names (`W. Europe Standard Time`, `Pacific Standard Time`) are not IANA names and are therefore skipped, not guessed (D-V4-29). `DTEND`: all-day sets `end_date = DTEND − 1 day`; a timed `DTEND` sets `end_date` only when the event ends on a later local day, otherwise it is ignored (D-V4-12).
- C5 `RRULE` is imported only when `parseRRule` (`app/src/lib/rrule.ts:65-115`) accepts it: `FREQ` `DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`, `INTERVAL` 1–99, `BYDAY`, `BYMONTHDAY` 1–31, `UNTIL`, `COUNT` 1–999. A UTC `UNTIL` instant (`...T{time}Z`) is converted to the user's local date before `parseRRule` — the parser reads `YYYYMMDD`/`YYYY-MM-DD` only, and truncating the instant would land on the wrong day for any timezone east or west of UTC (D-V4-29). Anything else (`BYSETPOS`, `HOURLY`/`MINUTELY`, `BYWEEKNO`, `BYMONTH`, `WKST`, out-of-range values) skips that event and lists a plain-words reason; the rule is never guessed or partially applied.
- C6 `EXDATE` values become the item's `exdates` as local dates in the user's timezone (a list on one line or several lines, each converted like `DTSTART`); an unparseable value is ignored, and the rest of the event still imports.
- C7 Import creates ordinary items in the caller's default calendar with the chosen type validated by `itemTypesRepo.mustHave`, `source = NULL`, `ics_uid` = the VEVENT UID, `repeat_from_completion = 0`, status `todo`, and no reminders. It never writes another user's calendar and never accepts a client-supplied calendar or owner id.
- C8 Limits: more than 2 000 VEVENTs in one file refuses the whole import with a message that gives the count (D-V4-12); an import that would take the calendar past `ROW_CAP` (50 000, `items.ts:68-77`) refuses before writing anything. Nothing is half-imported.
- C9 Re-import matches on `ics_uid` inside my default calendar among **live** rows only: an existing UID updates `title`, `time`, `rrule` and `exdates` but not `date` (D-V4-12) — never inserts a second row; a new UID inserts; a UID absent from the new file is left untouched (no silent delete); a trashed row with that UID is left alone and does not match, so a re-import inserts a fresh row (the index predicate in card 08 keeps trashed rows out of the way, D-V4-29).
- C10 Undo: the whole import is **one** undo entry (`app/src/lib/server/undo.ts:38-56`) with every inserted row as a created target and every updated row as a before-target; the toast says "Imported N events · Undo"; Undo removes every inserted item and restores every updated row, in one action. BREAKDOWN line 88 says "one `deleted_batch`" — that mechanism does not exist; the journal is `undo_actions`, and D-V4-29 keeps this shape.
- C11 Preview UI: an inline panel in the existing Import page, like the Notion import section (`settings/import/+page.svelte`), on desktop and phone — not `Dialog.svelte` (D-V4-29; supersedes DESIGN §1.3's "dialog / full sheet"). Every row/button is ≥ 48 dp, nothing scrolls sideways, and there is no "Click"/"Ctrl"/"Esc" copy. The browser keeps the chosen `File` and posts it again with the chosen type on Import; no server-side temp copy (D-V4-12). Errors are inline `.alert`s with the server message, never a toast (DESIGN §1.3 line 40).
- C12 States (DESIGN §3): loading = "Reading file…" inline in the preview area, no spinner over 300 ms; empty = a file with no VEVENT shows "No events in this file." and `Import` disabled; error = inline `.alert` with the server message + `Choose another file`; offline = the page reads `navigator.onLine` itself (`settings/import/+page.svelte`), and the file input and Import are disabled with "You're offline" (D-V4-29).
- C13 Permission/sharing: the page stays admin-only (`app/src/routes/settings/import/+page.server.ts:18`) and the import writes only the signed-in admin's own calendar (D-V4-12); an imported item is an ordinary planner row, never a shared/partner row; partner items and shared calendars are never read, matched or written, and no client-supplied owner/calendar id is accepted.
- C14 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§1/§3 planner, import), and `docs/SERVICE-HANDOFF.md` only if the release notes need to say "import is a normal in-app upload" (no new route or outbound call). `docs/v4/DESIGN.md` §1.3's "dialog / full sheet" is amended to the inline panel (C11).

## Out of scope

- Subscribed URL import (server fetching an outside `.ics`) — PLAN §3C line 124 defers it (SSRF + a new outbound call).
- A new dependency; if the parser grows past ~200 lines, choosing a vetted library is a separate decision (BREAKDOWN line 85).
- ICS import of pages/Keep/notes, or import into a database.
- Importing alarms (`VALARM`) as reminders, colours, attendees, or attachments.
- Creating the user's default reminder on imported rows.
- Duplicate detection beyond `ics_uid`/duplicate UIDs inside one file (no title/time matching).

## Files likely touched

- `app/src/routes/settings/import/+page.svelte` (new section, inline preview, file input)
- `app/src/routes/settings/import/+page.server.ts` (load + action; admin gate line 18, file-part size re-check)
- `app/src/lib/server/ics-import.ts` (new: parser + preview + apply)
- `app/src/lib/server/repo/items.ts` (`create` 226–262, `checkCap` 68–77, a UID-aware import insert/update path over live rows)
- `app/src/lib/rrule.ts` (`parseRRule` 65–115, `formatRRule`, `parseExdates`)
- `app/src/lib/server/repo/itemtypes.ts` (`list`, `mustHave`)
- `app/src/lib/server/undo.ts` (`undoable` 38–56)
- `app/src/lib/server/http.ts` (`admin`, `bad`, `notFound`)
- `app/src/lib/time.ts` (`TZDate` import at line 4, `localToUtc`/`utcToLocal`, `isDate`)
- `app/src/hooks.server.ts` (1 048 576-byte body cap line 59)
- `app/src/lib/settings-sections.ts` (Import already listed, line 11)
- `app/tests/unit/v4-11-ics-import.test.ts` (new), `app/tests/e2e/v4/11-ics-import.spec.ts` (new), `app/tests/e2e/phone/v4-11-ics-import.spec.ts` (new)

## Tests

- Builder: unit parser fixtures in `app/tests/unit/v4-11-ics-import.test.ts` — a uni timetable, a Google export, an Outlook export with an IANA `TZID`, an Outlook export with a Windows `TZID` skipped with its reason, folded lines, escaping, all-day, multi-day, EXDATE, a UTC `UNTIL` converted to the local date, a duplicate UID (first wins, later skipped), a VEVENT with no UID skipped as "no ID", an empty and a 300-character title, a file over 1 000 000 bytes, BYSETPOS/HOURLY/BYWEEKNO skipped with reasons; desktop e2e upload → preview → choose type → import → items on Today/Week → Undo, in `app/tests/e2e/v4/11-ics-import.spec.ts`; phone inline preview, 48 dp and no sideways scroll in `app/tests/e2e/phone/v4-11-ics-import.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-11-blind.test.ts`, `app/tests/e2e/v4/11-blind.spec.ts`, `app/tests/e2e/phone/v4-11-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md`; `docs/SERVICE-HANDOFF.md` only if ops text changes; `docs/v4/DESIGN.md` §1.3 (inline preview).

## Decided

- Decided: D-V4-12 — Settings › Import stays admin-only and imports into the signed-in admin's own calendar; all-day DTEND sets `end_date = DTEND − 1 day`, timed DTEND only when it ends on a later local day; re-import updates title, time and rule (+exdates), not date; one `undoable()` entry with created targets; big number = importable events; refuse files over 2 000 events with the count; the browser re-posts the File on Import.
- Decided: D-V4-29 — first UID wins, later same-UID rows skipped with a reason; trashed rows are left alone (the index predicate); "Untitled" + 300-character titles; unknown (Windows) TZID = skipped with a reason, IANA fixture; inline preview panel like the Notion section, not `Dialog.svelte`; client refuses > 1 000 000 bytes and the server re-checks the file part; a UTC UNTIL becomes the user's local date; `TZDate` is from `@date-fns/tz`; one `undoable()` entry (the BREAKDOWN `deleted_batch` deviation); the page uses `navigator.onLine`.
- Decided: D-V4-37 — a VEVENT without a `UID` is skipped with the reason "no ID" (counted in K), never imported with a guessed id.
