# Life Tracker — UX audit, desktop wireframes

Caveman doc. 2026-11-12. Canvas "Life Tracker Wireframes", desktop rows (Home, Week, Keep, Keep note, Pages, Database, Graph, Archive, Settings, M1 states).
Method: heuristic review against **Nielsen's 10 usability heuristics** (NN/g) + **WCAG 2.2 AA** (2.5.7 dragging, 2.5.8 target size, 2.4.11 focus not obscured, 1.4.3/1.4.11 contrast, 1.4.1 colour). Severity: **S3** fix before build · **S2** fix in its milestone · **S1** polish.
Not tested with users. Next step after fixes = 5-user hallway test (Jeremy + Neina + 3 others) on 5 tasks.

## Wins (keep)
- Save state shown on Pages + Keep note ("Saved", time). Undo + "can't undo safely" honest.
- Pin cap dialog prevents error instead of failing after.
- Archive + Trash split, restore everywhere. Delete never one-way.
- Real buttons/labels/aria in markup; keyboard hint in `/` menu; graph has list fallback.
- DB invalid value message says what + how to fix.

## Findings

| # | Sev | Heuristic / WCAG | Where | Problem | Fix |
|---|---|---|---|---|---|
| 1 | S3 | WCAG 2.5.8 target size | Home month chips, Week, Due chips | Status square 14 px, delete ✕ 20 px. Below 24×24 min, tiny next to drag targets. | Square hit area 24×24 (visual can stay 14 inside padding). ✕ 24 px. |
| 2 | S3 | WCAG 2.5.7 dragging | Home due chips → planner, Week "Not scheduled", Keep/Pages/DB reorder | Several actions only by drag on desktop. | Every drag has a click path: chip "Schedule…" (time picker), block ⋯ → Move/Resize fields, reorder ↑↓ in menus. Arrow keys on focused block already in spec — show it. |
| 3 | S3 | WCAG 1.4.3 contrast | Exam/Deadline chips | White on #C6534D = 4.4:1, fails small text. | Use #B84A44 (5.1:1). |
| 4 | S3 | WCAG 1.4.1 colour | Month chips, Week blocks | Type shown only by colour. Colour-blind user can't tell Work vs Event. | Tiny type glyph or 1-letter tag on chip hover/focus + type in tooltip/aria-label; legend popover on calendar header. |
| 5 | S2 | H2 match real world | Type list | "Exam" means "any hard deadline" — reads as school. Owner now works. | Rename label **Deadline** (data value can stay `Exam`). |
| 6 | S2 | H4 consistency | Header vs phone | Desktop "Home", phone "Today" for same core view. Calendar card has its own Month/Week toggle duplicating header Home/Week. | Name stays "Home" desktop, "Today" phone is fine *only if* both show same icon; drop in-card Month/Week toggle (header owns it) or make header "Calendar" with Month/Week inside. Pick one. |
| 7 | S2 | H4 consistency | Week | "Week 46" (ISO) + "Week 2 of 5" (of month) side by side. | Keep one. Rec: "Week of 9 Nov" title, drop both numbers or keep ISO only in tooltip. |
| 8 | S2 | H4 consistency | Pages: Database + Graph boards | Page tree sidebar missing on these two, present on Editor/Archive. Users lose place. | Same left tree on every Pages screen (collapsible). |
| 9 | S2 | H7 flexibility / H6 recognition | Header | No search on desktop at all. Second-brain size needs it. | Header search box + **Ctrl+K** palette (pages, notes, items, actions). Fold quick add into it later. |
| 10 | S2 | H10 help / H6 recognition | Global | Shortcuts (N, Ctrl+Z, Alt-drag, `/`) invisible except Add button. | "?" opens shortcut sheet; tooltips show shortcut ("Add  N"). |
| 11 | S2 | H1 status / H9 recovery | Home, Week, Keep | No drawn states for: loading, empty month, no notes, failed refresh, upload failed, offline. Spec requires them. | Add one "Desktop empty + error states" board. |
| 12 | S2 | H2 / H4 | Week side panel vs phone | "Not scheduled" (desktop) vs "To do today · no time set" (phone) = same idea, two names. | One name: **"No time set"**. |
| 13 | S2 | WCAG 1.4.11 non-text contrast | Link cards, table borders, chip edges | #CED3EE / #E3E4F0 borders ≈1.3–1.5:1 where border is the only edge of a clickable card. | Clickable cards: border #6B6B8F or navy. Decorative dividers can stay light. |
| 14 | S2 | H5 error prevention | Archive suggestions | 3 of 4 pre-ticked. One click archives 3 pages. | Reversible, so OK, but start **unticked** + "Select all" — user chooses. |
| 15 | S2 | H3 control | Keep note modal | Only "Close". No Esc hint, unclear if unsaved edits keep. | Esc closes, click outside closes, "Saved" stays visible; ⋯ menu lists Delete/Duplicate. |
| 16 | S1 | H8 minimalism | All boards | Yellow hard shadow on almost every card + gradient bg → nothing stands out. | Shadow only on raised/primary things (dialogs, primary button, active card). Plain cards get border only. |
| 17 | S1 | H2 | Planner | Hidden-hours strip says "Sleep" — app assumes. | Say "00:00–07:00 hidden · show". |
| 18 | S1 | H1 status | Header theme button | Moon icon while Auto + light → unclear state. | Icon reflects mode (sun / moon / half-circle for Auto), tooltip "Auto — light until 17:00". |
| 19 | S1 | H6 recognition | Header pins | Pins look like nav but lighter; no way to tell they're pages. | Small page glyph already there; add tooltip "Pinned page" + right-click → Unpin. |
| 20 | S1 | H7 efficiency | Keep | No multi-select (archive/label many). | Shift-click / checkbox mode with bulk bar. |
| 21 | S1 | WCAG 1.4.3 | Placeholders, drag handles | #8E8BB5 text ≈3.2:1. | Placeholder text #6B6B8F; handles are icons (3:1 ok) but give them aria-labels. |
| 22 | S1 | H4 | Buttons | "+ Add", "+ New", "+ New page", "+ Note" — mixed verbs. | Rule: "New <thing>" for create, "Add" only for quick add. |

## Fix order
1. S3 #1–4 (accessibility, cheap, affects every screen).
2. #5 rename + #12 naming + #6/#7 nav naming — decide once, then apply in wireframes + PRD.
3. #8, #9, #11 — layout/board work.
4. S1s during build.

## Status 2026-11-12
All 22 applied to wireframes (rev after audit): Deadline label + #B84A44, 24 px hit areas, Schedule buttons beside every drag, type legend + tooltips, header search Ctrl+K + ? shortcuts + Auto theme icon, in-card Month/Week toggle removed, "Week of 9 Nov", "No time set" everywhere, shared Pages tree on all Pages screens, new board "Desktop — empty, error, search, shortcuts", archive suggestions unticked, link-card borders #6B6B8F, shadows only on raised/primary, Esc on note dialog, Keep Select mode, verbs "New …".

Later (same day): owner rule "keep every live v1.1.0 feature" → in-card Month/Week toggle **restored**, heatmap "Week N of M" **restored**, Week panel name "Not scheduled" **restored**. Audit #6/#7/#12 accepted as-is.

## Owner decisions (closed 2026-11-12, all recs accepted)
- **UX-1** Rename Exam → Deadline in UI? (rec yes)
- **UX-2** Header: keep Home + Week links and drop in-card toggle, or one "Calendar" link with toggle inside? (rec drop in-card toggle)
- **UX-3** Week label: ISO "Week 46", "Week 2 of Nov", or neither? (rec neither, "Week of 9 Nov")
- **UX-4** Global search Ctrl+K pulled forward from P3 into M3 (Pages core)? (rec yes, second brain needs it)
