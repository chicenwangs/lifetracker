# v3.2 → v4.0 feature breakdown

Companion to `PLAN.md` (approved 2026-11-25). PR numbers match PLAN §8. Code wins over this doc.
Every PR: undo entry per mutation · phone path (≥ 48 dp, `BottomSheet`, `use:backCloses`, no Ctrl/Click copy) · unit + e2e (desktop + phone) · docs (`BUILD-NOTES.md`, `FEATURES.md`).

---

## v3.2 — Planner, no migration

### PR 1 · fix: Keep trash Restore 404
- **Bug**: `PATCH /api/keep/notes/:id {trashed:false}` → 404. `level()` returns null for rows with `deleted_at` set.
- **Fix**: restore path in `repo/keep.ts` checks owner directly (`owner_id = me AND deleted_at IS NOT NULL`). Do NOT change `level()`.
- **Test**: unit (owner restores; another user gets 404) · e2e trash → `/keep?scope=trash` → Restore → note is back.
- **Done when**: AGENTS.md Known issue 1 is removed.

### PR 2 · fix: Android desktop-word hints
- Sweep phone copy: `Search Ctrl+K`, `+ Add N`, any "Click/Esc/PC view". Show hints only for `pointer: fine`.
- **Test**: phone e2e asserts no `Ctrl`, `Click`, `Esc` text on the main tabs.
- **Done when**: AGENTS.md Known issue 3 is removed.

### PR 3 · feat: reschedule action set + Postpone/Skip
- **What**: one shared action list: `Today · Tomorrow · Next weekday · +1 week · Pick date…`, plus `Skip this one` on a repeating occurrence.
- **Where (this PR)**: ItemView, as a "Postpone ▾" button beside the date field. Phone: the row ⋯ sheet. Slipped (PR 4) reuses the same list.
- **Client**: `lib/client/reschedule.ts` = pure `targetDate(kind, today, tz)` + one `reschedule(item, kind)` call. Next weekday = Mon if today is Fri, Sat or Sun.
- **Server**: postpone = existing `PATCH /api/items/:id {date}` (on an occurrence id `id@date` it detaches, as today). Skip = new `POST /api/items/:id@date/skip` → `addExdate` + cancel that occurrence's reminder.
- **Edge**: a multi-day item moves its `end_date` by the same span. A timed item keeps its time. Linked planner block: leave it, toast says "Planner block stays on <day>". Skip on a non-repeating item: hidden.
- **Undo**: postpone = restore the old date. Skip = remove the EXDATE.
- **Test**: unit `targetDate` (Fri/Sat/Sun, month and year end, DST-free tz) · skip writes one EXDATE · e2e postpone + undo.

### PR 4 · feat: Slipped list
- **What**: top-level items, `status != done`, `COALESCE(end_date, date) < today`, **not repeating** (or `repeat_from_completion`, after PR 9). Own calendars only.
- **Server**: `itemsRepo.slipped(meId, today)`, newest first, cap 50 + "N more". Loaded in `/+page.server.ts` and `/today/+page.server.ts`.
- **Desktop**: collapsible "Slipped · 3" strip above the day planner on Home. Each row: title, original date ("Mon 18 Nov"), ⋯ = PR 3 actions, plus "Move all to today".
- **Phone**: the same strip at the top of Today. Row swipe right = done, left = delete (+Undo, phone rules). Tap = ItemView.
- **Empty**: strip hidden (no "nothing slipped" noise).
- **Undo**: bulk move = one undo batch.
- **Test**: unit query (repeat excluded, done excluded, end_date span) · e2e desktop + phone bulk move + undo.

### PR 5 · refactor: `agenda()` query
- Lift `rowsOn` out of `native.ts` into `lib/server/agenda.ts`: `agenda(me, from, to)` → items + blocks, expanded repeats, `hidden_types` applied, private flag kept.
- `native.ts` calls it. No behaviour change.
- **Test**: existing native tests stay green, plus one agenda unit test.

### PR 6 · feat: print week
- `@media print` for `/week`: hide the shell, nav and buttons. White background, black ink, type colour as a left border only. One A4 landscape page.
- Entry: "Print week" in the desktop ⋯ menu → `window.print()`. Not on phone.
- **Test**: e2e `page.emulateMedia({media:'print'})` → the header is hidden and 7 day columns are visible.

### PR 7 · feat: ICS export
- **Settings › Calendar feed** (desktop + phone): "Create feed link" → shows the URL **once**, with Copy · Rotate · Turn off.
- **Token**: random 32 bytes, stored hashed in `users.ics_token_hash`. Rotate = new hash. Off = NULL.
- **Route**: `GET /cal/<token>.ics` → public, read-only, rate-limited, `Cache-Control: private, max-age=300`. Unknown token = 404 (same body as any other 404).
- **Content**: own items from `agenda()`, today −30 d … +365 d. Repeats as RRULE + EXDATE (one VEVENT per series). All-day = `VALUE=DATE`. Timed items carry `TZID` of the user's tz + VTIMEZONE (60 min default length, or block length if linked). Private = `SUMMARY:Busy`, no description. Blocks: not exported (decide later). UID = item id + `@lifetracker`.
- **Ops**: add the route to `SERVICE-HANDOFF.md` (unauthenticated GET, no outbound calls).
- **Test**: unit ICS text (escaping `,;\\`, line folding at 75 octets, all-day, RRULE) · e2e create link → fetch → contains the item → rotate → old link is 404.

---

## v3.3 — Planner, migration 0011

### PR 8 · db: migration 0011
- `items.repeat_from_completion INTEGER NOT NULL DEFAULT 0` · `items.ics_uid TEXT` (+ index `(calendar_id, ics_uid)`) · `item_types.on_calendar INTEGER NOT NULL DEFAULT 1` · `users.digest_time TEXT` (NULL = off, `HH:MM` CHECK).
- ADD COLUMN only. Update `schema.ts`, Drizzle snapshot, `dormant.ts` if needed.
- **Test**: migration runs on an empty DB + the QA copy, and running it twice is safe (migrator). Owner runs it on a copy of real data.

### PR 9 · feat: repeat from completion
- **UI**: Repeat box gets a second radio: `From scheduled date` (default) · `From when I finish`. Only for daily, weekly or monthly with INTERVAL (no BYDAY combos: hidden when BYDAY is set).
- **Display**: a from-completion series shows **only its next occurrence** (its `date`) in every view and in the widgets. No future ghosts.
- **On done**: create the done copy dated today (history) and move the series `date` = today (owner tz) + interval. Relative reminders recalculate (`advanceRepeating` reads the new date).
- **Slipped**: an overdue from-completion series shows in Slipped (PR 4 condition).
- **ICS export**: a single VEVENT at its next date, no RRULE.
- **Undo**: restores the old date and removes the done copy.
- **Test**: unit next-date (done early, done late, month end) · e2e "water plants every 3 days" done → shows +3 from today.

### PR 10 · feat: `on_calendar` type flag
- **Settings › Types**: per-type switch "Show on Month calendar" (default on).
- **Hidden on**: Month view (desktop month grid + phone month) only.
- **Shown on**: Week, day planner, Today, widgets, due chips, Slipped, digest, ICS, search, item page. Reminders fire.
- **Code**: `MonthCalendar` filters on the type flag from `typesState`. No server change beyond the PATCH schema (`item-types/[id]`).
- Month day cell: optional "+2 hidden" hint? → no. Keep it clean (owner asked for less clutter).
- **Test**: unit filter · e2e: type off → item gone from Month, still on Week and Today.

### PR 11 · feat: ICS file import
- **Settings › Import** gets "Calendar file (.ics)". Upload ≤ 1 MB → preview: N events, M repeating, K skipped (with reasons) → choose type (default: one with `on_calendar = 0`, else None) → Import.
- **Parse**: our own small parser (VEVENT: UID, SUMMARY, DTSTART/DTEND, RRULE, EXDATE, TZID). No new dependency unless the parser grows past ~200 lines; then pick a vetted lib.
- **Map**: DTSTART → local date/time in the **user's** tz. RRULE → `rrule.ts` subset (FREQ, INTERVAL, BYDAY, BYMONTHDAY, UNTIL, COUNT). Anything else (BYSETPOS, HOURLY, BYWEEKNO…) → skipped and listed. Never guessed.
- **Re-import**: match on `ics_uid` → update title, time and rule. New UID → insert. A UID missing from the new file → left alone (no silent delete).
- **Undo**: one `deleted_batch` for all inserts. Updates journal their old values.
- **Limits**: 2 000 events per file, `ROW_CAP` respected.
- **Test**: unit parser fixtures (uni timetable, Google export, Outlook export with TZID, folded lines) · e2e upload → preview → import → undo.

### PR 12 · feat: daily digest
- **Settings › Notifications**: "Daily agenda" Off / time picker (default Off).
- **Text**: "4 items · 2 blocks · first 09:00". Nothing on → no push. Respects `notify_planner`.
- **Web**: `jobs.ts` tick sends to users whose local time ≥ `digest_time` and who haven't had one today (dedupe in `app_meta` or a small `digest_sent` key per user+date, no new table). Payload = title + route `/today`.
- **Android**: `/api/native` returns `digest: { at: <UTC ISO>, text }`. `Reminders.java` schedules one exact alarm (same channel). Re-scheduled on every sync and on boot.
- **Test**: unit "due now?" across tz and midnight · unit native payload · emulator manual check (documented in the QA run).

### PR 13 · feat: voice note (Android)
- **Plugin** `Speech.java`: `listen({ preferOffline: true })` → `{ text }`. Uses `SpeechRecognizer` / `RecognizerIntent.EXTRA_PREFER_OFFLINE`. `RECORD_AUDIO` asked on first tap with a short rationale.
- **UI**: mic button in the Keep quick-note composer, shown only when `isApp()` and the plugin is present. Text is appended at the cursor. Listening state = pulsing icon. Tap again = stop.
- **Web**: no button.
- **Release notes**: new microphone permission.
- **Test**: unit JS bridge mock · emulator manual check.

### PR 14 · feat: type starter pack
- Settings › Types: "Add a preset" → Class (`on_calendar = 0`), Errand, Health, Chore, Study, each with a colour + slug. Disabled when the 10-type cap is full ("Remove a type to add more"). A slug clash is skipped with a note.
- **Test**: unit cap + slug clash · e2e add Class.

Gate v3.3: migration tested on real-data copy (+ owed 0009/0010) · tag · APK.

---

## v4.0 — Pages overhaul, migration 0012

### PR 15 · db: migration 0012
- `pages.is_template INTEGER NOT NULL DEFAULT 0` · `pages.cover_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL`.
- `reminders` rebuild to add source type `page_todo` (copy rows, swap tables, recreate indexes, in one transaction).
- **Test**: migration on the QA copy, reminder rows survive with the same ids and statuses.

### PR 16 · feat: page emoji icon
- Button left of the title: shows the icon or a faint "Add icon". Popover (desktop) / BottomSheet (phone) with ~40 curated emoji + "Remove". No search, no full emoji set (keep it small).
- `PATCH /api/pages/:id {icon}` (schema already accepts it). Icon shows in the sidebar, page header, `[[` picker, backlinks, graph label.
- Undo: old icon.
- **Test**: e2e set → sidebar shows it → undo.

### PR 17 · feat: duplicate page
- Page ⋯ → "Duplicate". `POST /api/pages/:id/duplicate` → new page "Copy of <title>" right below the original. Same parent, icon and blocks (new block ids). `page_links` rebuilt for the copy. Database blocks: **schema copied, records not copied** (decide in review; Notion copies both). Child pages: not copied.
- Shared page: the copy belongs to the duplicator, with no shares.
- Undo = trash the copy.
- **Test**: unit (links rebuilt, ids new) · e2e duplicate + open.

### PR 18 · feat: callout, toggle, table of contents
- **Callout**: `/callout` → box with an emoji (click to change, reuses the PR 16 picker) and 4 tones (grey, blue, yellow, red) that work in both themes. Holds paragraphs and lists.
- **Toggle**: `/toggle` → summary line + collapsible body. `open` attr is saved in the JSON. Keyboard: Enter on the summary toggles it. Phone: 48 dp chevron.
- **TOC**: `/toc` → read-only list of H1–H3, click scrolls. Updates live. Empty → "Add headings to fill this".
- Unknown node safety: old clients and the Markdown export must handle them (render as blockquote / details / list).
- **Test**: unit schema round-trip (save → load) · e2e insert each, reload, still there.

### PR 19 · feat: `[[` mention + recent 10
- Suggestion `char: '[['`. Empty query → `pages.recent(me, 10)` (function exists, n = 5 today). Typing → `findByTitle` (exists). Arrow keys, Enter and Esc come from the shared Suggestion render.
- Inserts the existing `pageLink` node, so the links projection and graph pick it up unchanged.
- "Link to page" slash item opens the same suggestion (inserts `[[` at the cursor). Delete the separate picker dialog (`PageEditor.svelte` `picker` state).
- Last row: "Create page '<query>'" → creates a child page and links it (Obsidian feel). Undo removes both.
- Phone: list in a BottomSheet above the keyboard, 48 dp rows.
- **Test**: e2e `[[` → ↓↓ Enter → link inserted · type to search · create-new.

### PR 20 · feat: backlinks panel
- Under the editor: "Linked from (3)" with source page icon + title + a snippet of the linking block. Collapsed when 0 (hidden).
- **Server**: `pagesRepo.backlinks(viewer, pageId)` = `page_links` join `pages` on source, `deleted_at IS NULL`, **then each source checked with `level(viewer, 'page', id)`**. Drop what the viewer can't open. Archived = greyed "· archived".
- Loaded in `pages/[id]/+page.server.ts`.
- **Test**: unit access filter (partner's private page linking to a shared page is not shown) · e2e link A → B, open B, see A.

### PR 21 · feat: 2-hop local graph
- Page ⋯ → "Local graph": this page + direct links + links of links, in the existing sigma view, filtered server-side (`/api/graph?around=<id>&depth=2`, `MAX_NODES` respected).
- Fix the Known issue 2 sigma "no width" error here (init after the container has a size).
- **Test**: unit depth filter · e2e opens with no console errors.

### PR 22 · feat: page templates
- Page ⋯ → "Make template" / "Stop being a template". Templates leave the sidebar tree and live under "Templates" in the New page ▾ menu (desktop) / add sheet (phone).
- "New from template" = PR 17 duplicate logic, title "Untitled <template name>", placed at the chosen parent (default top level).
- Templates are searchable, and editing one doesn't change pages already made from it.
- **Test**: e2e make template → new from template → content copied → template not in tree.

### PR 23 · feat: DB board view
- View switch tab "Board": group by a select property (picker in the view settings, saved in `config_json`). Columns = options + "No value". Cards = title + 2 chosen properties.
- Move a card: drag **and** card ⋯ → "Move to <column>" (keyboard path). Phone: long press = pick up, plus the ⋯ path.
- No select property → "Add a select property to use Board".
- Undo: old value.
- Sets the view-switch pattern for PRs 24–25.
- **Test**: unit group query · e2e drag + keyboard move + undo.

### PR 24 · feat: DB calendar view
- Pick a date property. Month grid reuses `MonthCalendar` look (not its data code). A record shows on its date. Click a day = new record with that date. Records without a date go in a side "No date" list.
- Does NOT put records on the planner calendar (keeps the systems separate; revisit later).
- **Test**: e2e record appears on its date, create from a day.

### PR 25 · feat: DB gallery view
- Cards in a grid: cover = first image attachment property (or page cover after PR 31), title, 2 properties. Card size S/M/L in the view settings.
- **Test**: e2e cards render, click opens the record.

### PR 26 · feat: starter templates
- New page ▾ → "Starter templates": **Watch list** (gallery: title, status select Want/Watching/Done, rating, type), **Workout log** (table: date, exercise, sets, reps, weight + a calendar view), **Dev tracker** (board by status Backlog/Doing/Review/Done, priority, link).
- Creates a normal page + DB on tap, already marked as a template, so it can be reused. Not seeded at signup.
- **Test**: e2e create each → views exist.

### PR 27 · feat: Markdown import
- Pages ⋯ → "Import Markdown" (`.md`, ≤ 2 MB). Preview: page tree from `#` headings → Import under a chosen parent.
- **Map**: `#` = child page · `##`–`###` = headings inside it · `-`/`1.` lists · `- [ ]` to-dos · `>` quote · `> [!note]` → callout (Obsidian syntax) · fenced code · `[[Title]]` → page link if the title exists after import, else plain text · images/links kept as links (no fetching).
- Text before the first `#` = the parent page body.
- Undo: one batch trashes all created pages.
- Parser: the `marked` lexer is already a dependency (Keep uses it) → tokens → Tiptap JSON. No new dependency.
- **Test**: unit fixtures (LLM tree, Obsidian note with callouts and wikilinks) · e2e import → tree appears → undo.

### PR 28 · feat: Markdown export
- Page ⋯ → "Export Markdown": one page → `.md`. With children → `.zip` (folder per page). Links become `[[Title]]`, callouts `> [!note]`, toggles `<details>`. DB blocks become a Markdown table snapshot.
- Zip: check for an existing dependency first; if none, ship single-file export + "Export subtree" as one concatenated `.md`.
- **Test**: unit round-trip (export → import gives the same structure).

### PR 29 · feat: block drag handles + multi-select
- Hover handle ⋮⋮ left of each top-level block: drag to move, click = menu (Delete, Duplicate, Turn into…, Move to page). Keyboard: Alt+↑/↓ moves the block. Shift+click / Shift+↑↓ selects several blocks, then Delete / Move / Duplicate.
- Phone: long press a block = select (phone rule), then a bottom action bar. No drag on phone beyond long press pick-up.
- Uses Tiptap's NodeSelection + one custom plugin. Check whether `blockOps` (exists) already covers move.
- **Test**: e2e drag, keyboard move, multi-delete + undo.

### PR 30 · feat: reminders on page to-dos
- To-do item ⋯ (or `@` date chip) → "Remind me…" → reuse `Reminders.svelte`. `reminders.source_type = 'page_todo'`, `source_id = pageId:blockId`.
- Ticking the to-do cancels the reminder. Deleting the block cancels it on the next save (projection diff).
- Android: included in `/api/native` alarms, like other reminders. Respects `notify_pages`.
- **Test**: unit cancel on tick / delete · e2e set reminder → appears in Reminders list.

### PR 31 · feat: page cover image
- "Add cover" beside "Add icon": upload or pick an existing attachment → `pages.cover_attachment_id`. Shown as a 180 px banner (120 px phone), "Change" / "Remove" on hover / tap.
- Attachment refs: count the cover so the orphan purge doesn't delete it (`attachment_refs`).
- Backups already include attachments (check `SERVICE-HANDOFF.md`, update if not).
- **Test**: unit ref kept · e2e add cover, reload, remove.

Gate v4.0: migration tested on real-data copy · tag · APK · release notes.
