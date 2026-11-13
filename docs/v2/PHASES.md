# Life Tracker v2 — build phases

Caveman doc. 2026-11-13. Entry point for Claude Code. One phase per session/PR. **No deploy until P10.**
Release plan (owner): live stays on **v1.1.0** while all of v2 is built on branch `v2`. When every phase is green → one big release **v2.0.0** → deploy.

## Read order (every session)
1. `CLAUDE.md` (root) — rules.
2. This file — find the first phase not marked DONE.
3. `docs/v2/PRD.md` (what) → `FEATURES.md` (behaviour) → `DESIGN.md` (how).
4. `docs/v2/RELEASE-PARITY.md` — v1.1.0 features that must survive.
5. `docs/v2/SYSTEM-AUDIT.md` §5b checklist (DESIGN) — code lines to de-hard-wire.
6. Wireframes: `wireframes/v2/` (open `canvas.json` boards by file name). Old `wireframes/*.dc.html` = v1, reference only.
Old docs (`REQUIREMENTS`, `TECHNICAL`, `P1-NOTES`) still describe v1.1.0 code. v2 docs win on conflict.

## Ground rules
- Branch `v2` from `main` (main = v1.1.0 + PR #4). One PR per phase into `v2` (not main). `main` only gets hotfixes.
- Every phase: lint + types + unit + e2e green, v1.1.0 regression e2e green, migrations forward-only and tested on a **copy of the live DB** (anonymised `data/` snapshot), docs updated (`P1-NOTES` → rename `BUILD-NOTES.md` in P1, keep "what the app does now").
- A phase that needs a **D-xx** (PRD §12) stops and asks the owner, unless it's marked closed below.
- Default of every new setting = v1.1.0 behaviour.
- Version in `package.json` stays `1.1.0` until P10.
- Mark a phase **DONE** here (date + PR) when merged.

## Decisions to close before starting (rec = suggested)
Close now in one go so phases don't stall. Owner ticks or overrides; Claude Code copies the answer into PRD §12.

| D | Question | Rec | Needed by |
|---|---|---|---|
| D-08 | Same light/dark start allowed | reject | P1 |
| D-09 | Alt-drag copy map | items + blocks; never copy reminders/shares/secret | P1 |
| D-12 | Uploads: max size, types, orphan grace | 25 MB, image/pdf/office/zip/txt, 7 d | P1 |
| D-24 | Type cap | 10 total incl. 5 defaults | P1 |
| D-10 / D-11 / D-17 | Checklist depth · note bg images · Keep trash | 4 · later · 30 d | P2 |
| D-18 | Pages trash retention | 30 d | P3 |
| D-19 | DB type change with bad values | warn, keep raw | P4 |
| D-13..D-16 | All-day reminder time · missed · toggles · archived notes | 09:00 day before · show late once · toggles, no quiet hours · archived yes / trash no | P6 |
| D-23 | Outbound calls | push yes; link previews off by default | P6 |
| D-01..D-04 | Page share inheritance · links · DB records · public links | explicit only · no · whole DB · no | P7 |
| D-05 / D-06 | Co-edit policy · offline conflicts | Yjs spike decides · keep both copies | P7 / P8 |
| D-20 / D-22 | Pin custom label · import dormant v1 data | no · yes, one-time importer in P7 | P3 / P7 |

## Phases

| P | Name | Scope (refs) | Wireframe boards | Done when |
|---|---|---|---|---|
| **P0** | Setup + spikes | Pull main, branch `v2`, CI on `v2`, copy docs/wireframes in (done by planning chat), anonymised DB snapshot for migration tests, baseline test count from CI into BUILD-NOTES. Spikes S-1 Tiptap+Svelte 5, S-2 graph renderer at 5k nodes, S-3 upload streaming on read-only rootfs (EXDEV-safe), S-4 Web Push via tunnel. ADR-001..007. (DESIGN §22) | — | 4 ADRs written; go/no-go per library |
| **P1** | Foundations + system fixes | DESIGN §5b de-hard-wiring; `item_types` + flags (★ default, counts down) + type bar + Settings › Item types; Preferences: theme Auto + schedule + timezone + region + quick-add target + block length + plan ahead; visible hours on user; 8 badge colours; header (Search stub, Keep/Pages links, pins table, ? sheet, account menu); X/⊗ fix 24 px; global undo journal + centre toast; Alt-drag; Schedule buttons (no-drag paths); attachment store + `backup.sh` with uploads; empty/error/loading states. (PRD §4–5, PL-6/7; FEATURES §1–4, §3b; UX-AUDIT S3) | Main, Week, ItemPeek, QuickAdd, AddStates, Settings, SettingsTypes, SettingsMore, SettingsSharing, Auth, States, DStates, Header | All v1.1.0 e2e pass with defaults; type rename/delete/move tests; undo tests; contrast + 24 px checks |
| **P2** | Keep + phone Today | Keep notes, checklists (nest 4), labels, binders, pin, archive, trash, search, images/files, Select mode. Phone: breakpoint 700 px, bottom bar, Today (Now card, No time set today, timeline wheel), Add sheet (Plan it / Quick note), item sheet, Keep list/note. (FEATURES §5, §10) | Keep, KeepNote, MToday, MAdd, MItem, MKeep, MKeepNew, MKeepNote, MBar, MStates | KEEP-001..020, MOB-001..006 |
| **P3** | Pages core | Tree (shared sidebar), editor (Tiptap), blocks, `/` menu, inline marks, simple table, internal links, pins (≤3), archive + 90-day suggestions, Pages search; **global Ctrl+K** (pages, notes, items, actions). Phone All pages / page view. (FEATURES §6, PG-ARCHIVE) | Pages, PagesTree, PagesArchive, DStates (search), MPages, MPage | PAGE-001..016 + archive tests |
| **P4** | Databases | Props (8 types), records as pages, table view, sort/filter, saved views, column hide/reorder; board/calendar/list/gallery if time. Phone cards view. | Database, MDb | PAGE-010..014, 021 (workout tracker buildable) |
| **P5** | Graph | Graph read model, renderer from S-2, archived nodes dashed + toggle, list fallback, local graph. | Graph | PAGE-017..019, 5k-node perf target |
| **P6** | Reminders + push | `/remind 1w 3d 2d 1d 2h` (+15min per D-15) in quick add, item, Keep, page to-dos, DB dates; job runner; Web Push + VAPID; permission ask after tap; Settings › Notifications. Ops: outbound 443 note. | Settings (notifications), MSettings, MStates | NOTIF-001..011 |
| **P7** | Sharing + import | Page + note shares (view/edit), file access via source, revoke; co-edit per ADR-008 (cut line: may slip to v2.1); Keep Takeout import + export; one-time importer for dormant v1 tables (D-22). Calendar sharing stays as v1.1.0 + custom types. | SettingsSharing | Security matrix (DESIGN §21) all pass |
| **P8** | Mobile rest + PWA + help | Week/Month/More/Settings/Login phone screens, PWA manifest + icons + service worker, offline Keep queue, onboarding tour, Settings › Help, **dark theme pass on every new screen** (THEME.md), a11y + perf pass, no visible scrollbars rule. | MWeek, MMonth, MMore, MSettings, MLogin, MStates | MOB-001..010, ONB-001..007, axe clean, Home < 1.5 s LAN |
| **P9** | Release prep (no deploy) | Feature freeze. Full regression (v1 + v2). **Migration rehearsal on real backup copy** (restore → migrate → integrity_check → every v1 item/block/grant/theme intact). Backup + restore drill incl. uploads. Update SERVICE-HANDOFF (new env: UPLOAD_DIR, MAX_UPLOAD_BYTES, VAPID_*, JOBS_ENABLED; outbound 443; backup uploads), DEPLOYMENT, README, release notes `docs/v2/RELEASE-NOTES.md`. | all | Rehearsal log clean; owner clicks through every board vs app |
| **P10** | **v2.0.0** | Merge `v2` → `main`, bump `package.json` 2.0.0, tag `v2.0.0` → CI → GHCR. Hand to deploy chat with SERVICE-HANDOFF diff. Backup live DB **before** pulling the new image. Rollback = previous image + restore backup (forward-only migrations). | — | Live on planner.jeremyjosh.org, smoke test passed |

**Cut line if it gets long:** P7 co-edit and Takeout import, P4 extra views, P5 local graph → v2.1. Everything else is v2.0.

## Prompt to paste in Claude Code
> Read `CLAUDE.md` and `docs/v2/PHASES.md`. Do the next phase not marked DONE. Before coding, list the D-xx it needs and stop if any are open. Work on a branch off `v2`, open a PR into `v2`, then mark the phase DONE in PHASES.md.

## Status
| P | State | Date | PR |
|---|---|---|---|
| P0 | **DONE** · branch `v2` + CI on it · snapshot tool + migration test · baseline in P1-NOTES · spikes S-1..S-4 · ADR-001..007 (`docs/adr/`). Go: Tiptap, sigma, upload design, web-push. Carried forward (see `docs/adr/README.md`): push on Chrome/Android/iOS + from homelab → P6 · uploads in the real read-only container → P1 · graph 5k/20k is 29 fps → P5 · block ids → P3. Not done: Kept parity sheet (DESIGN §8), needs owner. | 2026-11-13 | #5 |
| P1 | **DONE** · D-xx all closed (PRD §12) · item types + flags + type bar + Settings › Item types · Preferences (Auto theme, tz, region, quick-add target, block length) · visible hours on user · 8 badge colours · undo journal + Ctrl+Z · Alt-drag copy · Schedule… + block Start/End · 24 px targets · attachment store + backups · `?` sheet. Moved: Search/Ctrl+K → P3, Keep/Pages links → P2/P3, pins → P3. Unit 290, e2e 16. See BUILD-NOTES. | 2026-11-13 | #6 |
| P2 | **DONE** · Keep (notes, checklists nest 4, images, labels, binders, colours, pin, archive, Trash 30 d, search, Select mode) · phone bottom bar, Today (Now card, no-time list, wheel), + Add sheet (Plan it / Quick note), item sheet. Built to FEATURES only (owner's Kept parity sheet still to come). Later: drawings, link previews, file cards, swipe. Unit 300, e2e 18. | 2026-11-13 | #7 |
| P3 | **DONE** · Pages tree + Tiptap editor (blocks, `/` menu, inline marks, table, image w/ alt, file, internal links), pins ≤ 3, archive + 90-day suggestions, trash 30 d, FTS search (Keep + Pages), global Ctrl+K. ADR-003 closed (replace-all save). Later: block drag handle, multi-select. Unit 313, e2e 19. | 2026-11-13 | #8 |
| P4 | **DONE** · databases on pages (inline or own page), 8 property types checked server side, table view (inline edit, columns hide/reorder, select options), saved views, one sort + AND/OR filters, records as pages (title syncs), D-19 keep-and-flag. Cut line used: board/calendar/list/gallery → v2.1. Unit 320, e2e 20. | 2026-11-13 | #9 |
| P5 | **DONE** · graph read model + `/pages/graph` (sigma + worker per ADR-007), link/parent/archived toggles, local graph (1 hop), select panel, keyboard walk, list fallback (phone default). PAGE-017..019. Perf = ADR-007 numbers (29 fps at 5k/20k on the iGPU). | 2026-11-13 | #10 |
| P6 | **DONE** · `/remind` in quick add, reminder editor (item, Keep note; DB records by API), runner + in-app channel + Web Push (VAPID env), Settings › Notifications, D-13..D-16 rules. Ops: VAPID_*, JOBS_ENABLED, outbound 443 in SERVICE-HANDOFF. Cut to v2.1: page to-do reminders. Push on Chrome/Android/iOS still unverified (ADR-006). | 2026-11-14 | #11 |
| P7 | **DONE** · page + note shares (view/edit, revoke, `/shared`), D-01..D-04 rules in one access check, files follow their source, database shared with its page (D-03). ADR-008: no live co-edit in v2.0 (409 keeps text). D-22 importer (dormant v1 → Keep). Fixed: page images now referenced (were GC-able). Cut to v2.1: Keep Takeout import/export, live co-edit. Unit 339, e2e 22. | 2026-11-14 | #12 |
| P8 | **DONE** · phone Week agenda + Month grid + More, PWA manifest/icons/service worker (shell only), offline badge + Keep offline queue (ADR-009, D-06 both copies), welcome tour (once, skip/finish saved) + Settings › Help, axe 0 serious on 10 screens × light/dark × PC/phone, Home < 1.5 s. Later: swipe gestures. Unit 339, e2e 25. | 2026-11-14 | #13 |
| P9 | **DONE** · freeze; regression unit 340 / e2e 25; migration rehearsal = built v1.1.0 DB → all migrations, every v1 row byte-identical, backup restores (in CI) + anonymised dev DB clean. Live-backup rehearsal skipped (owner). SERVICE-HANDOFF upgrade/rollback/checks, RELEASE-NOTES, README. No deploy. | 2026-11-14 | #14 |
| P10 | **DONE (release)** · `v2` merged into `main`, `app/package.json` 2.0.0, tag `v2.0.0` → release workflow → GHCR image + GitHub Release with deploy bundle. **Not deployed** (owner backs up live, then upgrades per SERVICE-HANDOFF §5). "Live + smoke test" = owner. | 2026-11-14 | tag |
| v2.0.1 | **DONE (release)** · PR #15: Pages UI to wireframes, graph node size + dark colours, no visible scrollbars (global), header pins reorder/unpin in Preferences, phone All pages (search + recent). No migration. Unit 341, e2e 25. | 2026-11-14 | #15 |
