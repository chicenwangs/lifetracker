# v4 plan — analysis of the owner's idea list

Status: PLAN 2026-11-25. Nothing built. Owner decisions answered in §7; §7 wins over earlier sections.
Checked against code at `73b639a` (main). Code wins over this doc.

## 1. Verdict

- Ideas are good, and most reuse data we already store. Few are truly new.
- As written they read as 25 separate features. They are really **5 systems**. Build each system once, and the features fall out.
- 4 ideas rest on a wrong assumption about the code (§2). Fixing the assumption changes the design.
- Biggest gaps: Android doesn't get web push, sharing and privacy leaks (backlinks, ICS), repeating items flooding a Slipped list, and no Markdown import or export (§5).
- Release split: **v3.2** planner, no migration · **v3.3** planner, migration 0011 · **v4.0 = Pages overhaul**, migration 0012.

## 1b. Brief — every idea in one line

v4 = **Pages overhaul**. Planner ideas ship before it as v3.2 / v3.3 (§6).

### v4 — Pages overhaul

| Idea | What you get | How (short) | Size |
|---|---|---|---|
| Emoji icon | Notion-style icon on each page + sidebar | `pages.icon` exists. Add picker only. | S |
| Duplicate page | Copy a page in one tap | copy row + blocks + rebuild links | S |
| `[[` mention + recent 10 | Type `[[`, pick a page with arrow keys | reuse `/` Suggestion; replaces old link dialog (fixes arrows) | S–M |
| Backlinks | "Linked from" list under each page | `page_links` exists; one query + access filter | S–M |
| Callout | Coloured box with emoji | new editor node, no migration | S |
| Toggle | Collapsible block | new node, open state in JSON | S–M |
| Table of contents | Clickable heading list | reads headings live | S |
| Templates | "New from template" | `is_template` flag + duplicate | M |
| Starter templates | Watch list, Workout log, Dev tracker | template pages with DB blocks | S each |
| DB views | Board, calendar, gallery | view types already allowed; UI + queries | L |
| Markdown import | Paste an LLM / Obsidian export, get a page tree | `.md` upload, `#` = child page | M |
| Markdown export *(gap)* | Get your notes out (backup) | page / subtree → `.md` | S–M |
| Cover image | Banner at top of page | new column, reuse attachments | M |

Pages items already in the v2.1 backlog, which fit this overhaul: block drag handles + multi-select · reminders on page to-dos · 2-hop local graph.

### v3.2 / v3.3 — Planner

| Idea | What you get | How (short) | Size |
|---|---|---|---|
| Slipped list | Overdue one-off items, never lost | undone + date < today; repeats never slip | M |
| Postpone / Skip | +1 day, next weekday, +1 week, skip one repeat | PATCH date / `addExdate`; shared action set | S |
| Print week | Fridge plan | print stylesheet on `/week` | S |
| ICS export | Plan shows in Google Calendar | token URL, private = Busy, own items only | M |
| Repeat from completion | "Every 3 days after I last did it" | flag + show next occurrence only | M |
| Timetable (hide from calendar) | Classes off the Month grid, still in planner + Week | per-type `on_calendar` flag | M |
| ICS import | Bring in a uni timetable | `.ics` upload → items of type Class | L |
| Daily digest | "4 items · 2 blocks · first 09:00" | web push job + Android alarm, toggle | M |
| Type starter pack | One-tap Class, Errand, Health… | fills free slots, cap stays 10 | S |
| Voice note | Mic in Android quick note | `SpeechRecognizer` plugin, text only | S–M |

## 2. What the code already says (corrections)

| Idea | Assumed | Actually |
|---|---|---|
| Custom item types | missing | Exists. `/settings/types`, `POST /api/item-types`. Cap 10 incl. 5 built-ins (D-24). Built-ins can be renamed or recoloured, not deleted (`repo/itemtypes.ts:161`). The real ask: a higher cap, starter packs, or deletable built-ins. |
| Hide from calendar | new per-item flag | `users.hidden_types` exists but hides a type **everywhere** (calendar, planner, widgets). We need a **per-place** rule, not a new hide feature. |
| Timetable as planner-only repeats | blocks repeat | `blocks.rrule` column exists, but `repo/blocks.ts` never reads it. Only **items** repeat. So the timetable has to be built from repeating items. |
| ICS export | from scratch | `users.ics_token_hash` already exists (dormant). Token storage is free: no migration. |
| DB board/calendar/gallery | new views | `database_views.view_type` already allows `table, board, calendar, list, gallery` + `config_json`. Needs UI and queries only. |
| Arrow keys in link picker | bug in the `/` menu | The `/` menu has arrows (`extensions.svelte.ts:158`). **Link to page** opens a separate dialog (`PageEditor.svelte:358`) that has none. Building `[[` on Suggestion fixes this for free. |
| Daily agenda push | push infra exists | It does on the **web**. The Android app uses native exact alarms fed by `GET /api/native` (no FCM). A digest needs a web-push job **and** a native alarm. |
| Repeat from completion | one branch in next-date | Items expand **every** occurrence in range (`inRange`), and marking one done detaches a done copy plus an EXDATE (`items.ts:302`). A from-completion series cannot show future copies: we don't know their dates yet. That is a different display rule, not one branch. |
| Skip occurrence | few lines | Yes, it is `addExdate`. It also has to cancel that occurrence's reminder and post an undo entry. Still small. |
| ICS import source | — | CHECK `items_source` only allows `'notion'`. Imported rows need a migration (new source value + a UID for re-import). |

## 3. The 5 systems

### A. Nothing gets lost (planner counterweight)

One **reschedule action set**, built once and used everywhere:
`Today · Tomorrow · Next weekday · +1 week · Pick date…` plus `Skip this one` on a repeating occurrence.

- Where it shows: Slipped list row, ItemView (item sheet), phone row ⋯ menu, digest notification (later).
- **Slipped list** = top-level items, not done, `date < today` (or `end_date < today`). Lives on Home/Today above the planner. Collapsible, count badge.
- **Postpone** = PATCH date (already supported). **Skip** = `addExdate`.
- **Repeat from completion** joins this system: when a from-completion item is done, its next date = done day + interval.
- Rules this system needs (gaps):
  - A missed daily repeat would add 30 rows to Slipped. Rule: a normal repeat **never slips**: the next occurrence is already coming. Only one-off items and from-completion series slip.
  - Every action = one undo entry. Bulk "Move all to today" = one undo batch.
  - Reminders: a postponed item's relative reminder recalculates (`reminders.ts` already recalculates from the source). A skipped occurrence cancels its reminder.
  - Planner blocks never slip: a past block is history, not a debt.

### B. The plan reaches you (outputs)

Three outputs, **one query**. Add `agenda(me, from, to)` on the server: items + blocks for a range, with type visibility, privacy and repeat expansion applied. `native.ts rowsOn` already does most of this for widgets. Lift it out and reuse it.

- **Daily digest** (off by default; setting = time, or Off): "4 today · 2 slipped · first 09:00".
  - Web: one job in `jobs.ts`, dedupe key = `user + local date`, sent at the user's local time.
  - Android: `/api/native` returns `digestAt` + text, and `Reminders.java` schedules one more exact alarm. Without this, the APK (your main phone path) never gets the digest.
  - Respect `notify_planner`. Skip the push if the day has nothing.
- **ICS export**: `GET /cal/<token>.ics`, read-only, no login. Token lives in `users.ics_token_hash`. Settings shows the URL once, with Rotate and Revoke.
  - Private items: export as "Busy" or leave out (decide, §7). Shared calendars: own items only by default.
  - Owner-local times → emit `TZID=<user tz>` + a VTIMEZONE, or UTC. All-day → `VALUE=DATE`. Repeats → RRULE + EXDATE (our subset is RFC 5545, so it maps directly). A from-completion series → its next date only.
  - Ops: a new public, unauthenticated route. Rate limit it, add it to `SERVICE-HANDOFF.md`, and check that the CSP/origin middleware lets GETs through.
- **Print a week**: `@media print` on `/week` (none exists today). Hide the shell, black on white, one page. Desktop only, reached from the ⋯ menu. The same stylesheet prints a Page for free.

### C. Timetable (repeat until + per-place visibility)

The real feature is **"which places show this type"**, not "hide this item".

- Add an `item_types` flag: `on_calendar` (default 1 = old behaviour). Example: a **Class** type with `on_calendar = 0`.
- This follows the rule "no behaviour keyed on a type name — use flags", and quick add `/class` already works.
- Per-type, not per-item, because a timetable is many items of one kind, and toggling 20 classes one at a time is the pain we're trying to remove. A per-item override can come later if it's ever needed.
- Where it applies (decide, §7):

| Place | Class type (`on_calendar = 0`) |
|---|---|
| Month view | hidden |
| Week view | **decide**: it's a calendar, but it's also where you see a timetable |
| Day planner / Today | shown |
| Widgets (Timeline, Now&Next, Week) | shown |
| Due-today chips, Slipped, digest | shown (counts in digest) |
| ICS export | shown (you want classes on Google Calendar) |
| Search, item page | shown |
| Reminders | fire as normal |

- Keep `hidden_types` (global hide) as is. Two controls: TypeBar = "hide everywhere now", type setting = "never on the month grid".
- **ICS import** lands here. Import a uni timetable as items of a chosen type (default Class), each VEVENT's RRULE mapped to `rrule.ts`.
  - Unsupported RRULE parts (BYSETPOS, hourly, etc.): expand into single items for the next N months, or skip and report. Never guess.
  - Re-import must update, not duplicate: store the VEVENT UID (migration).
  - One import = one `deleted_batch`, so the whole import has one Undo.
  - File upload first (uni portals give a `.ics` file). A subscribed URL import (server fetching outside URLs) is an SSRF risk plus a new outbound call. Defer it.

### D. Item types (the backbone)

Types already drive colour, quick-add slug, countdown and share default. v4 adds `on_calendar`. Optional extras:
- Starter pack on the types settings page: one tap adds Class, Errand, Health, Chore, Study.
- Raising the 10-type cap is a D-24 change. Owner decides.
- Deletable built-ins needs a "move items to type X" step first. It's the riskiest ask here, so leave it last.

### E. Pages become a knowledge base

Order matters, because each step pays for the next:

1. **Icon picker**: button beside the title, small emoji grid, `PATCH {icon}`. On phone it opens in `BottomSheet`. No migration.
2. **Duplicate page**: copy the row + `page_blocks` + icon. Rebuild `page_links` for the copy, otherwise the graph and backlinks miss it. Undo entry.
3. **`[[` inline mention**: a Suggestion with `char: '[['` that inserts the existing `pageLink` node. Empty query = 10 most recent pages (`pages.last_opened_at` is already indexed). Typing searches `/api/pages/find`. Arrow keys come free. Point the old "Link to page" slash item at the same picker and delete the separate dialog. **This one change fixes your arrow-key complaint.**
4. **Backlinks panel**: `SELECT source pages WHERE target = this`. **Filter every source through `level()`**, or the panel leaks the titles of pages the viewer can't open (partner's private pages linking to a shared one). Hide trashed sources. Show archived ones greyed, like the graph does.
5. **Callout, Toggle, Table of contents**: new Tiptap nodes. They're stored as JSON in `page_blocks`, so no migration. The toggle's open state lives in node attrs (it saves with the page, so it's the same for every viewer: fine for a household). TOC reads the headings live.
6. **Templates**: `pages.is_template` (migration). "New from template" = Duplicate (step 2) with a new parent. Templates are hidden from the sidebar tree and listed in a "New page ▾" menu. Starter templates (Watch list, Workout log, Dev tracker) are pages with database blocks, seeded **on demand** (not at signup).
   - Do NOT revive the dormant `workout_logs` / `lists` tables. Templates are plain pages + databases.
7. **DB views**: board (group by a select property, drag + a keyboard "Move to…" menu), calendar (date property, reusing the month grid component), gallery (cards). Good templates depend on these: Dev tracker = board, Watch list = gallery.
8. **Markdown import (your LLM idea)**: the contract format = **Markdown**: `#` headings become child pages or sections, `-` bullets, `- [ ]` to-dos, `>` callouts. Any LLM, Obsidian or Notion export produces it. Upload a `.md` file and get a page tree.
   - Its partner, **Markdown export** of a page or subtree, is missing from your list. For a self-hosted Notion replacement, getting your notes out is a backup must.
9. **Cover image**: `pages.cover_attachment_id` (migration), reusing attachments. Cosmetic, so it goes last.

### Capture (stands alone)

- **Voice in the quick note (Android)**: a small Capacitor plugin around `SpeechRecognizer`, with `EXTRA_PREFER_OFFLINE` for on-device recognition.
  - Needs the `RECORD_AUDIO` runtime permission plus a Play-style rationale. That's a new permission in the APK, so mention it in the release notes.
  - Text only, nothing stored. Phone copy says "Speak", not "Click".
  - Web: skip. Chrome's Web Speech API sends audio to Google, which breaks "no outside services".
  - Honest call: the keyboard mic already does this. Build it only if one tap really beats switching keyboards. Lowest priority.

## 4. How the pieces connect

```
item_types flags ──► agenda() query ──► digest (web push + Android alarm)
   (on_calendar)        │                ICS export ──► Google Calendar
        │               ├──────────────► print week
        ▼               ▼
  Month/Week views   Slipped list ◄── reschedule actions ◄── ItemView / row ⋯ / notification
                        ▲                  │
                        └── repeat-from-completion (next date on done)

ICS import ──► items of type Class (on_calendar=0, RRULE UNTIL)

Duplicate page ──► Templates ──► starter templates ──► need DB views (board/gallery/calendar)
[[ mention ──► page_links ──► backlinks (+level() filter) + graph
Markdown import/export ──► page tree (LLM, Obsidian, backup)
```

## 5. Gaps — not in your list, but needed

1. **Android digest path** (§3B). The biggest silent gap.
2. **Privacy/sharing**: backlink titles, ICS export of private and shared items, and whether a partner's shared items count in your digest and Slipped list. Default: own items only.
3. **Repeating items in Slipped** (§3A rule), or the list floods.
4. **Markdown export** of pages. Data portability for a Notion replacement.
5. **Undo coverage**: skip, postpone, bulk move, duplicate, from-template, ICS import (one batch), icon change.
6. **Offline**: postpone/skip from the phone while offline. The offline queue covers Keep and quick add only. Either add these actions to it, or show the usual offline toast. Decide per action.
7. **Phone paths for every feature**: Slipped on Today (row swipe right = done, ⋯ = reschedule), emoji and template pickers in `BottomSheet`, `use:backCloses` on each new picker, 48 dp targets, no "Ctrl/Click/Esc" copy. Print = desktop only.
8. **Known bugs first**: the Keep trash Restore 404 (`level()` vs `deleted_at`). v4 adds more undo and restore paths through the same check. Also the Android desktop-word hints, since new phone copy would add to that debt.
9. **0009/0010 real-data test is still owed** (memory). Do it before shipping migration 0011.
10. **Docs per phase**: `SERVICE-HANDOFF.md` (public ICS route, digest job, new Android permission), `BUILD-NOTES.md`, `FEATURES.md`, PRD D-xx for new decisions.

## 6. Phases (one branch + PR per issue off `main`)

Sizes: S < 1 day, M 1–3 days, L > 3 days of agent work.

### v3.2 — Planner, no migration

| # | Phase | Items | Size |
|---|---|---|---|
| 0 | Debt | Keep restore 404 · Android hint copy | S |
| 1 | Nothing gets lost | reschedule action set · Postpone + Skip in ItemView · Slipped list (Home + Today, phone + desktop) · bulk "move all to today" | M |
| 2 | Outputs | `agenda()` query · print week · ICS export (reuses `ics_token_hash`) | M |

### v3.3 — Planner, migration 0011

Columns (ADD COLUMN only, no table rebuild): `items.repeat_from_completion` (0) · `items.ics_uid` (NULL) · `item_types.on_calendar` (1) · `users.digest_time` (NULL = off).
Imported rows keep `source` NULL and are marked by `ics_uid`, so the `items_source` CHECK is untouched. Changing a CHECK in SQLite means rebuilding `items`, the biggest table. Avoid that.

| # | Phase | Items | Size |
|---|---|---|---|
| 3 | Repeats | repeat from completion (next occurrence only, Repeat box radio, reminders `advanceRepeating`, ICS export as single) | M |
| 4 | Timetable | `on_calendar` flag + type toggle · surface table (§3C) · ICS file import (RRULE map, UID re-import, batch undo) | L |
| 5 | Digest | web job + Android alarm + settings toggle | M |
| 6 | Capture + types | voice plugin (Android) · type starter pack (fills free slots, cap stays 10) | S each |

### v4.0 — Pages overhaul, migration 0012

Columns: `pages.is_template` (0) · `pages.cover_attachment_id` (NULL). Reminders on page to-dos add a `reminders.source_type` value, which means a CHECK change and a rebuild of `reminders` (a small table, acceptable). Test it on a copy of real data.

| # | Phase | Items | Size |
|---|---|---|---|
| 7 | Editor quick wins | icon picker · duplicate page · callout · toggle · TOC | M |
| 8 | Linking | `[[` mention + recent 10 (replaces link dialog, fixes arrows) · backlinks (level-filtered) · 2-hop local graph (backlog) | M |
| 9 | Templates | `is_template`, New from template · starter templates on demand (Watch list, Workout log, Dev tracker) | M |
| 10 | DB views | board / calendar / gallery | L |
| 11 | Markdown | import (LLM / Obsidian, `#` = child page) + export page / subtree | M |
| 12 | Editor depth (backlog) | block drag handles + multi-select · reminders on page to-dos · cover image | M–L |

Order inside v4: 7 → 8 → 9 → 10 → 11 → 12. Templates need Duplicate (7). Good starter templates need DB views (10), so seed them after 10 or ship them table-only first.

Done per phase = CLAUDE.md rule (lint, types, unit, e2e desktop + phone, docs, PR, PHASES row).

## 7. Owner decisions (answered 2026-11-25, add to PRD §12 as D-xx when work starts)

These answers override anything above that disagrees.

1. Slipped = **one-off items only** (+ from-completion series). Normal repeats never slip.
2. `on_calendar = 0` type: **hidden on Month, shown on Week.**
3. Visibility = **per type** (`item_types.on_calendar`). No per-item flag.
4. ICS export: private items = **"Busy"** (no title). **Own items only**, no shared calendars.
5. Digest counts **today's items + planner blocks**. **No slipped count, no partner items.** Text: "4 items · 2 blocks · first 09:00".
6. Type cap **stays 10** (D-24 holds). Built-ins stay undeletable. **Starter pack** fills free slots only (greyed out when full).
7. Markdown import: **`#` = child page** under one parent page.
8. Voice plugin: **build it** (v3.3 phase 6). Release notes must mention the new `RECORD_AUDIO` permission.
9. Release: **v3.2 → v3.3 → v4.0**. v4.0 = Pages overhaul only (owner, 2026-11-25). Digest needs `users.digest_time`, so it ships in v3.3.

## 8. Work split (one issue = one branch = one PR off `main`)

> **Update 2026-11-25 (owner):** no v3.2 / v3.3 tags. Everything below ships as **one release, v4.0.0**. v3.3 = milestone M1, the Pages overhaul = milestone M2 (QA checkpoints, no tags). Run by the team loop: `qa/TEAM-PLAN.md`, `qa/TEAM-LOOP.md`. Screens: `docs/v4/DESIGN.md`.

Planner first (owner, 2026-11-25). `∥` = can run in parallel with other `∥` rows in the same release (no shared files, no dependency).

### v3.2 — Planner, no migration (7 PRs)

| PR | Work | Needs | Size | ∥ |
|---|---|---|---|---|
| 1 | fix: Keep trash Restore 404 | — | S | ∥ |
| 2 | fix: Android desktop-word hints | — | S | ∥ |
| 3 | feat: reschedule action set + Postpone/Skip in ItemView | — | S | ∥ |
| 4 | feat: Slipped list (Home + Today, phone + desktop, bulk move) | 3 | M | |
| 5 | refactor: `agenda()` query lifted from `native.ts` | — | S | ∥ |
| 6 | feat: print week stylesheet | — | S | ∥ |
| 7 | feat: ICS export (token URL, Busy, rotate/revoke) | 5 | M | |

Gate: full test suite · tag v3.2.0 · APK (PR 2 changes the shell).

### v3.3 — Planner, migration 0011 (7 PRs)

| PR | Work | Needs | Size | ∥ |
|---|---|---|---|---|
| 8 | db: migration 0011 (columns only, no behaviour) | — | S | first |
| 9 | feat: repeat from completion | 8 | M | ∥ |
| 10 | feat: `on_calendar` type flag + place rules | 8 | M | ∥ |
| 11 | feat: ICS file import | 8, 10 | L | |
| 12 | feat: daily digest (web push + Android alarm + toggle) | 8, 5 | M | ∥ |
| 13 | feat: voice note plugin (Android) | — | S–M | ∥ (no migration, can float into v3.2) |
| 14 | feat: type starter pack | 10 | S | |

Gate: migration 0011 tested on a copy of real data (+ owed 0009/0010 test) · tag v3.3.0 · APK (PRs 12, 13).

### v4.0 — Pages overhaul, migration 0012 (17 PRs)

| PR | Work | Needs | Size | ∥ |
|---|---|---|---|---|
| 15 | db: migration 0012 | — | S | first |
| 16 | feat: page emoji icon picker | — | S | ∥ |
| 17 | feat: duplicate page | — | S | ∥ |
| 18 | feat: callout + toggle + TOC blocks | — | M | ∥ |
| 19 | feat: `[[` mention + recent 10 (replaces link dialog) | — | S–M | ∥ |
| 20 | feat: backlinks panel (access-filtered) | — | S–M | ∥ |
| 21 | feat: 2-hop local graph | 20 | M | |
| 22 | feat: page templates | 15, 17 | M | |
| 23 | feat: DB board view | — | M | ∥ |
| 24 | feat: DB calendar view | — | M | ∥ |
| 25 | feat: DB gallery view | — | M | ∥ |
| 26 | feat: starter templates (Watch list, Workout log, Dev tracker) | 22, 23, 25 | S | |
| 27 | feat: Markdown import (`#` = child page) | 18 | M | |
| 28 | feat: Markdown export (page / subtree) | 18 | S–M | |
| 29 | feat: block drag handles + multi-select | 18 | L | |
| 30 | feat: reminders on page to-dos | 15 | M | |
| 31 | feat: page cover image | 15 | M | |

Gate: migration 0012 tested on a copy of real data · tag v4.0.0 · APK.

File clashes to watch: PRs 16–20 all touch `PageEditor.svelte` / `extensions.svelte.ts`, so merge them one at a time and rebase each on the last. PRs 23–25 share `DatabaseView.svelte`: land 23 first, since it sets the view-switch pattern.

Totals: 31 PRs · v3.2 ≈ 1 week · v3.3 ≈ 2 weeks · v4.0 ≈ 4 weeks of agent work. These are rough estimates; owner review and deploys come on top.
