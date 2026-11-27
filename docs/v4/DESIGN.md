# v3.3 + v4.0 design — screens, states, copy

Caveman doc. Written 2026-11-25. The spec for *how it looks and behaves*. What to build = `BREAKDOWN.md` (PR numbers match).
Pictures = `wireframes/v4/index.html` (open in a browser, no runtime needed). Board ids below (D = desktop, M = phone).
If this doc and BREAKDOWN disagree on behaviour: BREAKDOWN wins, then fix this doc. If either disagrees with code: code wins.

## 0. Rules every screen keeps

- Tokens from `docs/THEME.md` only (`--ink`, `--card`, `--border`, `--accent`, `--ground`, `--rule`, `--danger`…). No new colours, except the 4 callout tones (§2.3), which get light + dark pairs added to THEME.md in PR 18.
- Desktop: 1.5px navy card edge + yellow hard shadow on popovers and dialogs (same as SlashMenu). Hit ≥ 24 px.
- Phone (< 700 px, or coarse + ≤ 500 px high): every popover becomes `BottomSheet.svelte`. Hit ≥ 48 dp. `use:backCloses` on every new sheet/menu.
- Long press = pick up / select. Never a menu, never delete.
- Every mutation shows the undo toast ("Duplicated · Undo", "Moved to Doing · Undo").
- Empty state = one short line + one action. Never a blank box.
- Phone copy: "Tap", never "Click". No key hints on phone.

---

## 1. v3.3 — Planner screens

### 1.1 Repeat box: from completion (PR 9) · board D-R1 / M-R1
- Inside the existing Repeat box, below the frequency row:
  `Next one counts from` ◉ `Scheduled date` ○ `When I finish it`
- Shown only for daily or monthly rules with no weekdays, end date or count (O-9, D-V4-27); a weekly rule always carries BYDAY, so it never qualifies. A rule that stops qualifying clears the flag and hides the row.
- Summary line under the box: "Every 3 days, counted from when you finish". The state shows here only — no item-row glyph.
- A from-completion series shows one row, at its date; finishing it files a done copy today and moves the series to today + the interval.

### 1.2 Types: calendar switch + presets (PR 10, 14) · board D-T1 / M-T1
- Each type row in Settings › Types gets a switch: `Month calendar` (on by default). Helper under the list: "Off = hidden on Month, still on Week, Today and reminders."
- Under the list: `+ Add a preset ▾` → menu: Class · Errand · Health · Chore · Study (colour dot + name). Full cap (10) → button disabled, helper "Remove a type to add more". A preset whose name exists → greyed with "(have it)".

### 1.3 Import a calendar file (PR 11) · board D-I1 / M-I1
- Settings › Import › `Calendar file (.ics)` → file picker (≤ 1 MB).
- Preview (dialog / full sheet):
  - Big line: "38 events · 12 repeating · 3 skipped"
  - `Put them in type` select (default: first type with Month calendar off, else None).
  - "Skipped (3)" disclosure: one row each, reason in plain words ("repeats by week number — not supported").
  - "Already imported: 20 will be updated" when UIDs match.
  - Buttons: `Cancel` · `Import 38` (primary).
- Done → toast "Imported 38 events · Undo". Errors inline in the dialog (red `.alert`), never a toast.

### 1.4 Daily agenda push (PR 12) · board D-N1 / M-N1
- Settings › Notifications, new row: `Daily agenda` · segmented `Off | On` · time field (shows when On, default 07:30).
- Helper: "One notification a day with today's items and blocks. Nothing on → no notification."
- Preview chip under it, live: "4 items · 2 blocks · first 09:00".

### 1.5 Voice in Keep quick note (PR 13, app only) · board M-V1
- Mic button inside the composer, right of the text field, 48 dp. Idle = outline mic. Listening = filled mic + pulsing ring + text "Listening…" as placeholder.
- First tap → Android permission rationale sheet: "Life Tracker uses the microphone only while you hold this on. Speech is turned into text on your phone." `Continue` · `Not now`.
- Denied → mic greyed, tap shows toast "Microphone is off for Life Tracker. Turn it on in Android settings."

---

## 2. v4.0 — Pages overhaul

### 2.1 Page anatomy (desktop) · board D-P1
Top to bottom, editor column max 760 px:
1. Header bar (exists): breadcrumb · Saved · Pin · Share · ⋯
2. **Cover** (PR 31): 180 px full-width banner when set. Hover → `Change cover` · `Remove` buttons bottom-right.
3. **Icon** (PR 16): 56 px emoji, overlapping the cover bottom edge by 28 px when a cover exists.
4. Hover row above the title (only when empty): `☺ Add icon` · `▭ Add cover` in `--faint`, 13 px.
5. Title (h1, 34 px).
6. Blocks. Each top-level block shows on hover, in the left gutter: `+` (insert below) and `⋮⋮` (drag / menu) (PR 29).
7. **Linked from (n)** panel (PR 20) after the last block, separated by a `--rule` line.

Phone (board M-P1): cover 120 px, icon 44 px, no hover row: `Add icon` / `Add cover` live in the page ⋯ sheet. No gutter handles (see 2.8).

### 2.2 Icon picker (PR 16) · board D-P2 / M-P2
- Popover 320 px: grid 8 × 5 of curated emoji (40), 36 px cells, `Remove` link top-right.
- Keyboard: arrows move, Enter picks, Esc closes. Focus returns to the icon button.
- Phone: BottomSheet, 6 columns, 48 dp cells.
- Set curated: 📄 📝 📚 🎓 💼 🏠 🧠 💡 ✅ 📅 🗂️ 📌 🔖 🧪 🛠️ 💻 🖥️ 🌐 🔒 💰 🛒 🍳 🏋️ 🏃 🧘 🎮 🎬 📺 🎵 🎨 ✈️ 🚗 🌱 🐾 ❤️ ⭐ 🔥 ⚠️ ❓ 🎯.

### 2.3 Callout, toggle, TOC (PR 18) · board D-P1 (inline) / D-P3
- **Callout**: rounded 10 px box, 3 px left bar in tone ink, tone background, emoji at top-left (click → icon picker). Tone switch = the block's ⋮⋮ menu → `Colour ▸ Grey / Blue / Yellow / Red`.
  - Tones (light bg / bar · dark bg / bar): Grey #F3F2FA / #6B6B8F · #201F48 / #8E8BB5 · Blue #E3ECF7 / #2F5E8E · #16304A / #8DB4DA · Yellow #FAEDB8 / #8A6D00 · #3A3416 / #F3D053 · Red #FBE3E1 / #A83A35 · #4A1F1D / #F2A19C.
- **Toggle**: `▸` chevron (24 px desktop, 48 dp phone) + summary text. Body indented 24 px. Empty body placeholder "Empty toggle. Type or drop blocks inside."
- **TOC**: box with `--ground` fill, title "On this page", H1–H3 indented 0 / 16 / 32 px. Empty → "Add headings to fill this".
- Slash menu entries (with hint text): `Callout — Highlight a note` · `Toggle — Hide details under a line` · `Table of contents — List this page's headings`.

### 2.4 `[[` link picker (PR 19) · board D-P4 / M-P4
- Opens at the caret on `[[`. Same look as the slash menu (it reuses the Suggestion renderer).
- Empty query: header "Recent", 10 rows: icon + title + parent path in `--faint`.
- Typing: header "Pages", matches with the query bolded. Last row always: `+ Create page "<query>"` (hidden when the query is empty).
- No match: only the create row + "No page called that".
- Footer hint (desktop only): `↑↓ move · Enter link · Esc cancel`.
- Inserted link = existing page-link chip (icon + title, underlined on hover).
- Phone: BottomSheet docked above the keyboard, max 5 rows visible, 48 dp rows, no footer hint.

### 2.5 Linked from (PR 20) · board D-P1 / M-P1
- Heading `Linked from (3)` with chevron, open by default when 1–5, closed when more than 5.
- Row: source icon · source title (link) · one-line snippet of the linking block, link text in bold, ellipsis.
- Archived source: greyed, "· archived" after the title.
- 0 links → whole panel hidden.

### 2.6 Page ⋯ menu and New page ▾ (PR 17, 21, 22, 27, 28) · board D-P5 / M-P5
Page ⋯ menu, in this order (groups split by a rule):
1. Pin · Share · Move to…  *(exist)*
2. `Duplicate` · `Make template` (or `Stop being a template`) · `Local graph`
3. `Export Markdown` (`Export with sub-pages (.zip)` when it has children)
4. Archive · Move to Trash *(exist)*

Phone: same items in the page actions BottomSheet; `Add icon` / `Add cover` added at the top.

New page ▾ (sidebar header button, desktop) / Add sheet › Page (phone):
- `Blank page`
- `From template ▸` → the user's templates (icon + title). None → "No templates yet. Use ⋯ › Make template on any page."
- `Starter templates ▸` → Watch list · Workout log · Dev tracker, each with a one-line description.
- `Import Markdown…`

Template pages: header shows a `--ground` pill "Template · edits don't change pages made from it". Not in the sidebar tree.

### 2.7 Database views (PR 23–25) · boards D-DB1..3 / M-DB1
- View tabs row (exists, today only "Table"): `Table · Board · Calendar · Gallery · +`. `+` → picker of the 4 types + name field.
- View settings (⚙ at the right of the tabs): Board → `Group by` (select properties), `Card shows` (2 property pickers). Calendar → `Date property`. Gallery → `Card size S / M / L`, `Card shows`.
- **Board**: columns 260 px, header = option colour dot + name + count. Last column "No value". Card: title + 2 property chips. `+ New` at the column bottom. Card ⋯ → `Move to ▸ <columns>` · `Open` · `Delete`.
  - Phone (M-DB1): one column at a time; column chips row on top (`Backlog 4 · Doing 2 · …`), swipe left/right moves between columns (peers). Long press card = pick up; card ⋯ → Move to.
  - No select property → empty state "Board groups cards by a select property." + `Add a select property`.
- **Calendar**: month grid (MonthCalendar look). Record = chip with title. Click empty day → new record dated that day. Right rail 220 px "No date (n)". Phone: grid with dots, tap day → list under the grid; "No date" as a chip at the bottom.
- **Gallery**: grid, card width S 180 / M 240 / L 320 px. Cover 16:9 (image property, else page cover, else `--ground` with the record icon). Phone: 2 columns (S/M) or 1 (L).

### 2.8 Block handles and multi-select (PR 29) · board D-P6 / M-P6
- Desktop gutter (hover a top-level block): `+` and `⋮⋮`, 24 px each, `--faint`, `--ink` on hover.
- Drag `⋮⋮` → blue 2 px drop line between blocks. Esc cancels.
- Click `⋮⋮` → menu: `Delete` · `Duplicate` · `Turn into ▸` (Text, H1–H3, Bullet, Number, To-do, Quote, Callout, Toggle) · `Colour ▸` (callouts only) · `Move to page…` (opens the `[[` picker in "move" mode).
- Keyboard: Alt+↑ / Alt+↓ move the block. Shift+↑ / Shift+↓ extend the selection. Esc clears.
- Selected blocks: `--pill-card` background. Floating bar at the bottom of the editor: "3 blocks · Delete · Duplicate · Move to page…".
- Phone: long press a block = select it (haptic). Then tap more blocks to add. Bottom action bar (48 dp): `Delete · Duplicate · Move · Done`. Back clears the selection first.

### 2.9 Remind me on a to-do (PR 30) · board D-P7 / M-P7
- To-do block ⋮⋮ menu gets `Remind me…` (to-dos only). Opens the existing `Reminders.svelte` picker.
- A to-do with a reminder shows a 🔔 chip after the text: "🔔 Fri 09:00". Click the chip = edit / remove.
- Ticking the to-do: chip strikes through, reminder cancelled, toast "Reminder cancelled · Undo".

### 2.10 Local graph (PR 21) · board D-P8 / M-P8
- Opens as a large dialog (desktop 900 × 640) / full-screen sheet (phone) over the page.
- This page = big node in `--ink`. 1-hop links medium, 2-hop small and faded. Label = icon + title.
- Top bar: title "Links around <page>" · `Depth 1 | 2` segmented · `Open full graph` link.
- Tap a node = open that page (dialog closes).

### 2.11 Markdown import (PR 27) · board D-P9 / M-P9
- Picker (`.md`, ≤ 2 MB) → preview dialog:
  - "Will create 6 pages" + tree preview (indent per `#` level, icons 📄).
  - `Put under` page picker (default: the page you are on, or top level).
  - Notes in `--faint`: "3 links will connect to existing pages · 2 stay as text".
  - `Cancel` · `Import 6 pages`.
- Done → toast "Imported 6 pages · Undo" and the parent opens with the tree expanded.

### 2.12 Starter templates (PR 26)
- Watch list: gallery (Status: Want / Watching / Done, Rating 1–5, Type: Film / Series / Anime / Book).
- Workout log: table + calendar view on Date (Exercise, Sets, Reps, Weight kg).
- Dev tracker: board by Status (Backlog / Doing / Review / Done), Priority (Low / Med / High), Link (url).
- Each opens after creation with a one-time hint line at the top: "This is a template copy. Rename it and start adding."

---

## 3. States checklist (each new screen must have all)

| State | What shows |
|---|---|
| Loading | skeleton rows in `--ground`, no spinner over 300 ms |
| Empty | one line + one action (copy in §1–2) |
| Error | `.alert` inline with the server message + Retry |
| Offline (phone) | actions that need the server disabled, helper "You're offline" (offline queue #105 covers block edits only) |
| No access (shared, read) | edit controls hidden, menus show only read actions (Duplicate, Export, Local graph) |
| Dark | every colour from a token pair; screenshot both themes in e2e for D-P1 and D-DB1 |

## 4. Open design questions (owner)

1. Duplicate copies database **records** too, or schema only? (BREAKDOWN PR 17 says schema only, "decide in review".) Default if no answer: schema only.
2. Slipped strip collapsed on phone by default? (v3.2 report item 3.) Default if no answer: collapsed in landscape only.
