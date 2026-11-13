# System audit — "built for me" vs "a system"

Caveman doc. 2026-11-12. Read of git tag **v1.1.0** code + current wireframes.
Question: where is the core loop hard-wired to Jeremy's habits, and what is the smallest fix that makes it work for anyone **without** a learning curve.

## Rules for fixes
1. **Loop stays.** Home month + planner, square cycle, N quick add, drag to block, Week, sharing by code. No new concepts.
2. **Behaviour hangs on a setting or a type flag, never on a name.** (Bad: "if type == 'Exam' show countdown".)
3. **Every knob has a good default = today's behaviour.** Jeremy notices nothing after the upgrade.
4. **Knobs live in Settings, max ~6 new.** Nothing new on Home.

## What is hard-wired (found in code)

| # | Hard-wired | Where (v1.1.0) | Hurts who | Fix | New UI |
|---|---|---|---|---|---|
| 1 | The 5 types `Work Exam Event Hobby Dating` | `schema.ts` CHECK, `types.ts` ×2 lists, `quickadd.ts`, `seed.ts`, `MonthCalendar` legend, `settings/sharing`, `time.ts` | anyone whose life ≠ uni + dating | `item_types` table (already planned, PL-6). One server source; every list reads it. | Settings › Item types (drawn) |
| 2 | **Countdown badge only for type "Exam"** | `time.ts:175` `if (i.type !== 'Exam')` | custom "Bills", "Assignment", "Renewal" types get no countdown | Type flag **"Counts down to the date"** (Deadline on by default). | 1 checkbox per type |
| 3 | Quick add default type = **Event**; timeline drag = None | `quickadd.ts:814`, `:845` | users who mostly log Work | Mark one type as **default** (★ in Item types). Drag default stays "No type". | ★ column |
| 4 | Quick add default destination = **timeline only** (your "no filler in calendar" rule) | `quickadd.ts` | users who live in the month view | Preferences: **"Quick add goes to: Timeline / Calendar"** (default Timeline). `/calendar` `/both` still override. | 1 radio |
| 5 | Single time = **60 min**; chip → block = 60 min; snap 15 | `quickadd.ts`, `DayPlanner`, `WeekCalendar` | short-task people (30 min) | Preferences: **"Default block length" 15/30/45/60/90** (default 60). Snap stays 15 (part of the loop). | 1 select |
| 6 | **Visible hours** saved in a cookie → per browser, not per user | `client/hours.svelte.ts` `lt_hours` | you on phone + PC get different ranges | Move to `users.visible_hours`; cookie only as first paint. Roll handles unchanged. | none |
| 7 | **Week starts Monday**, **24 h clock**, dates read **D/M** | `firstDay: 1`, `hour12:false`, quickadd D/M rule | US-style users | Preferences: **"Region style": Malaysia/UK (Mon, 24 h, 16/11) · US (Sun, 12 h, 11/16)**. One choice sets all three. | 1 select |
| 8 | **Timezone** = KL default with **no UI** to change it | `env.ts`, `schema.ts`, `time.ts` | anyone abroad / travelling | Preferences timezone picker (already planned, TH-UI-03). | 1 select |
| 9 | Badge colours = 4 fixed, list copied in 2 files | `colors.ts`, `api/me/prefs` | >4 people sharing look alike | One list, 8 colours, never a type colour. | none (existing picker) |
| 10 | Share code kinds = fixed 5 + None + Blocks | `types.ts SHARE_KINDS` | custom types can't be shared | Built from `item_types` (+ "share by default" flag, drawn). | none new |
| 11 | Notion import = your export shape | `seed.ts`, `/settings/import` | nobody else (admin only) | Keep as is, label "Notion import (Life Tracker format)". New users start clean with 5 types + tour. | none |
| 12 | Dark theme default for new accounts | `users.theme` | first impression | D-07: new accounts **Auto**; you keep Dark. | none |

## Checked and fine (keep, don't add knobs)
- Status = 3 states (todo ▶ ✓). Simple, universal.
- 15-min snap, overnight blocks, drag/resize — part of the tested loop.
- Plan before bed (night / morning / off) — already a setting. Good model for the rest.
- Overlap toggle, Busy/hidden per type, view-only codes — already user-chosen.
- Heatmap 0–6 h scale, 7-day "due soon" window — sensible fixed numbers.
- Hidden-hours roll handles — direct manipulation, no settings page needed.

## Proposed changes (smallest first)

| Fix | Effort | Milestone |
|---|---|---|
| A. Type **flags** instead of names: `counts_down`, `is_default` (+ planned `share_default`) | S | M1, with item types |
| B. Visible hours → user column (sync) | S | M1 |
| C. Preferences: timezone · region style · quick-add destination · default block length | S–M | M1 (with Auto theme, same page) |
| D. One badge-colour list, 8 colours | XS | M1 |
| E. New-account defaults: Auto theme, 5 types, empty calendar, tour later | XS | M1 |

After A–E: total new controls = **2 type flags + 4 Preferences fields**. Home, Week, quick add, sharing look and work the same.

## Status
All A–E accepted 2026-11-12 → PRD PL-6/PL-7, FEATURES §3b/§4, DESIGN §5/§5b, wireframes (Settings › Item types ★/Counts down, Preferences › Planner defaults, new-type popover flag, phone Settings rows, 8 badge colours). M1.

## Not proposed (too much curve)
Multiple calendars per user, custom status sets, custom fields on items, per-type durations, per-type colours per partner, rule-based automation. Pages databases already cover "my own fields" for power use.
