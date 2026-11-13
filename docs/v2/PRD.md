# Life Tracker — PRD (what + why)

Caveman doc. Rev 1.1, 2026-11-12. Compact of PRD v1.0 + error fixes (see FIX LOG end).
Owner: Jeremy (`chicenwangs`). Repo `github.com/chicenwangs/lifetracker`. TZ default `Asia/Kuala_Lumpur`.
Set: **PRD.md** (what) → **FEATURES.md** (behaviour) → **DESIGN.md** (how). Decisions list lives HERE only (§12). Milestones live HERE only (§13).

## 0. State now

- **Next release = v2.0.0 (big bang).** See PHASES.md.
- **Live:** `https://planner.jeremyjosh.org`, **v1.1.0**, homelab Docker + Cloudflare Tunnel (P2b done). Ops contract = repo `docs/SERVICE-HANDOFF.md`.
- **Rule: every v1.1.0 feature stays** (core loop tested 1 week). Parity list = RELEASE-PARITY.md.
- Live app = Life Planner only: auth + open sign-up (admin can set invite-only), Home (month 2/3 + planner 1/3), Week, item peek, N quick add, trash, view-only calendar sharing by `LT-` code, light/dark theme ("gradient C").
- Test counts disagree across old docs (237 / 258 / 260). **Truth = CI.** Don't quote a number without checking.
- Dormant data in DB (no UI): goals, courses, places, lists, list_items, people, person_facts, ideas, workout_split/logs. Keep it. See D-22.

## 1. Product

One self-hosted app, three parts, one account, one deploy:

| Part | Is | Route |
|---|---|---|
| Life Planner | calendar + day planner (exists) | `/` Home, `/week` |
| Keep | quick notes, checklists, labels, binders, files, reminders | `/keep` |
| Pages | Notion-style pages, blocks, tables, databases, graph | `/pages` |

Rules:
- Modular monolith. Keep + Pages = routes in same app. Not services.
- Pages = general tool. Workout tracker = a Page user builds. No Workouts module. No per-tracker code.
- Private by default. Calendar share ≠ note share ≠ page share.
- Desktop + mobile both designed on purpose. Mobile = own layout (PWA), same data.
- Core must work with no paid SaaS. No telemetry.

Supersedes old docs: "phone = afterthought", "Places/Lists/People/Ideas/Workouts = separate services", "Keep/Pages excluded".

Non-goals: microservices, native iOS/Android, spreadsheet engine/macros, social/public publishing by default, AI features, Workouts module, auto calendar-view switching by time.

## 2. Users

| Who | Can |
|---|---|
| Admin (Jeremy) | everything + users, sign-up mode, import |
| Member | own planner/Keep/Pages + what's shared to them |
| Collaborator | role on one shared Page/note (view/edit), not an account type |

## 3. Navigation

- Desktop header: app mark · **Home · Week · Keep · Pages** · 0–3 pinned Pages · quick add · theme · avatar.
- Pages link always there (fix: v1.0 header had no way into Pages when 0 pins).
- Pins: per user (all devices), max 3 hard cap, reorder, unpin ≠ delete, title follows Page, lost access → pin gone/unavailable, no leak.

## 4. Life Planner

- PL-1 **No regression.** Home, Week, peek, quick add, sharing, trash, theme keep working. Item dates stay local dates; blocks stay UTC.
- PL-2 **Fix missing ⊗/X.** Every deletable chip/block/row shows delete on hover + focus; touch gets visible action. Not clipped/covered. Label "Delete <title>".
- PL-3 **Global undo.** Ctrl+Z (Cmd+Z mac) outside text fields = undo last app action, all modules. In text fields = native text undo. Toast centre-ish: "Undid: moved 'X'". No false success. Permanent delete not undoable. No redo (yet).
- PL-4 **Alt-drag = duplicate.** Source unchanged, new copy at drop, one undo step. Which objects + which fields copy = D-09. Minimum safe: plain planner block.
- PL-5 Theme schedule changes theme only, never calendar view.
- PL-6 **Custom item types (owner 2026-11-12).** 5 defaults (Work, Deadline, Event, Hobby, Date) + user types, **max 10 total** (D-24); "No type" always exists, not counted. Type bar on Month + Week shows every type (colour + name = legend, click = show/hide) with **+** to add one fast. Settings › Item types: rename, recolour, reorder, quick-add slug, share default, delete (custom only; items moved to a chosen type, undoable). Defaults can be renamed/recoloured, not deleted. Each type has two flags: **★ default** (used when quick add has no `/type`; Event at start) and **counts down** (shows `5d`/`Today`/`2d late`; on for Deadline). Behaviour never keys off a type name.
- PL-7 **Defaults, not hard-wiring (SYSTEM-AUDIT, owner 2026-11-12).** Preferences adds: timezone, **region style** (Malaysia/UK: Mon · 24 h · D/M — or US: Sun · 12 h · M/D), **quick add goes to** (Timeline/Calendar), **default block length** (15–90, 60). Visible hours saved on the user (all devices). Badge colours: one list of 8. Every default = v1.1.0 behaviour, so nothing changes for existing users.

## 5. Theme + timezone

- Modes: Light · Dark · Auto. Header sun/moon still works, stays consistent with the saved mode.
- Auto default: Light 07:00–16:59, Dark 17:00–06:59. Start-inclusive (07:00 = Light, 17:00 = Dark). User can move both starts. Overnight dark works.
- Timezone per user (existing `users.timezone`, reuse it, no 2nd setting). Default Malaysia KL. Change → theme recalculates now. Never shifts stored dates.
- Manual Light/Dark ignores schedule; editing schedule while manual saves it, doesn't switch.
- Default for new accounts = D-07. Existing users keep current theme.

## 6. Keep

Own route + layout. No Pages tree. Note in 1 click, no title/label needed. Reference = Kept web feature set (behaviour only, no code/branding).

- K-1 Notes: create, edit, autosave, optional title, duplicate, trash/restore/permanent delete, created/edited info.
- K-2 Checklists: add/edit/delete/reorder items, check/uncheck, nested (depth = D-10, rec 4), collapse. Check parent ≠ check children.
- K-3 Content: images, drawings, links (+safe preview, D-23), file attachments. Unknown type = name card, no preview.
- K-4 Labels: many per note, filter. Delete label keeps notes.
- K-5 Binders: named collections, note in many binders, reorder. Delete binder keeps notes. Binder ≠ label.
- K-6 Look: colours, backgrounds (D-11), pin, grid/list, drag reorder. Colour never only signal.
- K-7 Archive (hidden from default, searchable, restore). Trash (restore, explicit permanent delete). Retention = D-17.
- K-8 Search title/body/checklist text + filters (label, binder, type, has-attachment, pinned, archived/trash). Permission-filtered.
- K-9 Reminders on notes via shared reminder system (§8).
- K-10 Later: share note view/edit, live co-edit (D-05), offline edit + sync (D-06), Google Keep Takeout import with report, export, backup.
- Out (native-only): widgets, OS share sheet, device-only mode, geofence reminders, Apple Reminders.

## 7. Pages

- PG-1 Workspace: tree, create, rename, move, reorder, delete/restore (D-18), search. Stable ids (links survive rename/move).
- PG-1b **Archive (owner 2026-11-12).** Pages are a long-lived second brain, so old pages get archived, not deleted. Archived page: gone from sidebar tree, pins and default search; **stays in the graph** (dashed node, toggle) and links to it keep working; opens read/write like normal with an "Archived · Restore" bar. Archiving a parent archives its subpages. Archive view lists all with Restore. App suggests pages not opened in 90+ days; never archives on its own. Archive ≠ trash, never purged.
- PG-2 Nesting: child pages. No self-parent, no move under own descendant.
- PG-3 Block editor. Page = ordered typed blocks, not one HTML blob. First set: paragraph, H1–H3, bullet, numbered, to-do, divider, simple table, image, file, link/bookmark, internal page link, database. Later: quote, callout, toggle, code, embed.
- PG-4 `/` menu: filter, arrows, Enter, Esc. Not inside URL/code.
- PG-5 Blocks: edit, insert, reorder (drag + menu), duplicate, delete, convert, copy/paste. Multi-select later. Removing a file block never deletes a file used elsewhere.
- PG-6 Inline: bold, italic, underline, strike, code, link.
- PG-7 Simple table = content block. No types/sort/filter/views. ≠ database.
- PG-8 Database: inline or full page. Props: title, text, number, date, checkbox, select, multi-select, url. Records open as Pages. Table view first; board, calendar, list, gallery later. Sort, filter, hide/reorder columns, saved views. Type change = D-19.
- PG-9 Later: relations, rollups, formulas (no arbitrary code).
- PG-10 Internal links by id. Target renamed/moved → still works. Target gone/no access → "unavailable", no leak.
- PG-11 Knowledge graph = read-only view generated from: parent-child, internal links, later DB relations. Pan/zoom/drag (layout only), click node → open page. Files not nodes. Local graph + filters later. Pages work without graph.
- PG-12 Pin to header (§3).
- PG-13 Share page view/edit with registered users, revoke. Files follow page access. No inheritance guessed: D-01..D-04. Live co-edit = D-05.

## 8. Reminders + push

- One shared reminder system for planner items/blocks, Keep notes, page to-dos, dated DB records.
- Commands (exact): `/remind 1w` `/remind 3d` `/remind 2d` `/remind 1d` `/remind 2h` = that long **before the item's time**, not before now. Many per item. Bad value = clear error.
- Reschedule item → relative reminders recalc. Delete item → reminders stop. Restore → recalc.
- Channels: in-app + browser Web Push (needs permission, HTTPS, subscription). Deny = app still works. Never claim "delivered" without proof.
- Open: all-day time D-13, past-due/missed D-14, quiet hours + per-kind toggles D-15, archived notes D-16.
- Note: owner earlier wanted `/remind15min` and per-kind toggles (timeline vs calendar). Not in v1.0 list. Add with D-15 if still wanted.

## 9. Mobile + PWA

- **Phone = glance + capture, not planning.** Plan week/day on PC. Phone answers "what now, what next" and grabs notes fast. (Owner, 2026-11-12.)
- Opens on **Today**: Now card, "To do today · no time set" list (dated today, no time; tap clock = give it a time), scrollable timeline wheel centred on now.
- Bottom bar (5, Material/HIG pattern): Today · Week · **+ Add** (centre) · Keep · More. Add sheet has two tabs: Plan it / Quick note.
- More = pinned pages, All pages, Month, Trash, Settings, Help. Week/Month read-first on phone.
- Own phone layout, same data/account. Not a shrunk desktop.
- Everything touch-doable. Drag always has a tap/menu alternative. No hover-only.
- Installable PWA, standalone, icons. Offline shell. Offline status shown. Never fake success offline.
- Offline Keep view + queued edits (D-06). Offline Pages edit not in first PWA.

## 10. Onboarding

- Tour once per user (completed/skipped saved server-side). Spotlight, Next/Back/Skip/Finish. Skips missing targets.
- Settings > Help: guides per module + restart tour. Docs only describe shipped stuff.

## 11. Non-functional

- Self-host, data in deploy, backup covers DB **and** uploads.
- Server-side access checks everywhere (search, graph, export, notifications, files too).
- A11y: keyboard, focus ring, labels, WCAG AA (4.5:1 text, 3:1 large/controls), colour never alone, reduced motion.
- No silent data loss: save state visible, failed save keeps text, migrations keep all data.
- Perf: Home < 1.5 s LAN / < 3 s tunnel. Keep/Pages/DB/graph targets set in DESIGN once real data size known.
- Node 22, current Chrome/Edge/Firefox desktop + current mobile browsers. Feature-detect push/PWA/offline.
- Lint, types, unit + e2e gates stay.

## 12. Decisions (single list — FEATURES + DESIGN point here)

Nobody guesses these. Block the feature until closed. Rec = suggestion only.

| ID | Question | Blocks | Rec |
|---|---|---|---|
| D-01 | Parent page share → children too? | page share, graph | explicit only |
| D-02 | Internal link exposes target to collaborator? | links, graph | no, needs own grant |
| D-03 | Per-record DB permissions? | DB share | no, whole DB |
| D-04 | Public/anon page links? | share | no |
| D-05 | Concurrent edit policy (CRDT/OT) | co-edit Keep/Pages | spike Yjs first |
| D-06 | Offline conflict policy | offline Keep | keep both copies |
| D-07 | ~~New-account theme~~ **CLOSED 2026-11-12: Auto** for new accounts; existing users keep their theme | theme | — |
| D-08 | Same light/dark start time allowed? | theme | reject |
| D-09 | Alt-drag: which objects + field copy map | PL-4 | blocks + items; drop reminders/shares |
| D-10 | Keep checklist max depth | K-2 | 4 |
| D-11 | Note background images in first Keep? | K-6 | later |
| D-12 | Upload max size, allowed types, orphan cleanup grace | files | 25 MB, allowlist, 7 d |
| D-13 | Reminder time for all-day items | reminders | 09:00 local, day before |
| D-14 | Past-due / missed reminders | reminders | show once late, mark missed |
| D-15 | Quiet hours, per-kind toggles, extra durations (15min…) | reminders | toggles yes, no quiet hours v1 |
| D-16 | Reminders on archived/trashed notes | Keep reminders | archived yes, trash no |
| D-17 | Keep trash retention | K-7 | 30 d |
| D-18 | Pages delete/trash + retention (archive part closed 2026-11-12, PG-1b) | PG-1 | trash 30 d |
| D-19 | DB property type change with bad values | PG-8 | warn, keep raw value |
| D-20 | Pins: custom label/icon? | §3 | no, use page title |
| D-21 | ~~Mobile nav~~ **CLOSED 2026-11-12:** bottom bar Today · Week · + Add · Keep · More; opens on Today | §9 | — |
| D-22 | Dormant data (lists, date ideas, people facts, places, ideas, workouts) → import into Keep/Pages? | migration | yes, one-time importer, later |
| D-23 | Outbound calls (link previews, Web Push) — changes "no outbound calls" ops contract | K-3, §8 | push yes; previews server-side, SSRF-guarded, opt-in |
| D-24 | Type cap = 10 total incl. 5 defaults, or 10 custom on top? | PL-6 | 10 total (as drawn) |
| UX-1..4 | **CLOSED 2026-11-12:** type label Exam → **Deadline** (data value stays `Exam`); header owns Home/Week (no in-card toggle); week title "Week of 9 Nov"; global search **Ctrl+K pulled into M3** | UX-AUDIT.md | — |

## 13. Milestones (single numbering — M0..M8)

| M | Ships | Needs closed |
|---|---|---|
| M0 | Spikes: Tiptap + Svelte 5, graph lib, file streaming, Web Push. ADRs. Baseline from CI. | — |
| M1 | X fix, global undo, Alt-drag, Auto theme + schedule, custom item types + type bar + type flags, Preferences planner defaults (timezone, region, quick-add target, block length), visible hours on user, 8 badge colours, header (Keep/Pages links + pins table), attachment store, reminder skeleton | D-08, D-09, D-12, D-24 |
| M2 | Keep core: notes, checklists, labels, binders, pin, archive, trash, search, images/files · **phone Today screen + bottom bar** (glance + quick add + quick note) | D-10, D-11, D-17 |
| M3 | Pages core: tree, editor, blocks, `/` menu, links, search, pins, archive + suggestions · global Ctrl+K search (pages, notes, items, actions) | D-18 |
| M4 | Databases: props, records, table view, sort/filter, saved views, record pages | D-19 |
| M5 | Graph | — |
| M6 | Reminders + Web Push, all modules | D-13..D-16, D-23 |
| M7 | Sharing (Keep + Pages + files), co-edit, Keep import/export | D-01..D-06 |
| M8 | Rest of mobile (Week/month/Pages read views), PWA install, offline Keep, tour, help, a11y/perf pass | D-06 |

**Release plan (owner 2026-11-13):** no per-milestone releases. Live stays v1.1.0; all M0–M8 built on branch `v2`, then release prep + one big **v2.0.0** deploy. Build order + gates = `PHASES.md` (P0 = M0, P1 = M1 … P8 = M8, P9 release prep, P10 v2.0.0). Mobile considered in every phase; P8 = finished, not first look.

## 14. Done checklist (product level)

Planner: no regressions · X fixed · Ctrl+Z global with toast · Alt-drag dup.
Theme: 3 modes · KL default · schedule editable · no view switching.
Keep: route · notes + nested checklists · images/drawings/links/files · labels ≠ binders · pin/archive/trash/search · reminders.
Pages: nest · blocks · `/` · tables ≠ DBs · records as pages · links survive moves · graph from real links · workout tracker buildable · ≤3 pins · no leaks.
Reminders: 5 commands · many per item · recalc on move · push degrades OK.
Mobile: opens on Today · + Add and Keep 1 tap · touch · installs · honest offline.
Onboarding: once · skippable · saved · help page.

## 15. Change control

Scope change = say what, why, what it touches, which test changes, migration needed. Update this file before treating it as baseline. Implementation convenience never deletes a requirement.

## FIX LOG (v1.0 → rev 1.1)

1. State: v1.0 said "deploy next"; site live on v1.1.0 → §0.
2. Header had no Pages entry when 0 pins (PRD 5.2 vs FS 2.3) → added Pages link.
3. Three decision lists with clashing ids (PRD D-01..15, FS D-01..20, TDD T-01..15; e.g. D-05 = co-edit in one, Alt-drag in other) → one list §12.
4. Three release schemes (PRD Release 1–8, FS M1–M8, TDD Phase 0–8) disagreed on where reminders/sharing land → one M0–M8 §13.
5. FS priority labels P0–P3 clash with repo phases P1/P2/P3 → FEATURES uses KEEP/CORE/EXT/LATER.
6. Keep R2 "integrates notifications" before the reminder system existed → reminders all in M6.
7. Test-count quote removed → CI is truth.
8. Outbound calls (push, link previews) break the SERVICE-HANDOFF "no outbound calls" contract → D-23.
9. Old dormant module data had no plan → D-22.
10. Memory: owner wanted `/remind15min` + per-kind toggles; v1.0 silent → noted under D-15.
12. Page archive added (PG-1b): second-brain graph keeps archived pages; sidebar stays short.
11. Mobile direction set: phone = Today glance + capture, not calendar planning; Today screen moved up to M2 (D-21 closed).
