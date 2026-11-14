# Life Tracker v2 — release notes

## v2.0.3 (2026-11-14) — Android app, no migration
From v2.0.x: just pull the new image. The app needs this server (it reads the new `/api/native`).
- **Android app:** `life-tracker-2.0.3.apk` on this release. The site in an app, plus:
  - **Widgets:** Today timeline (from now on, `+` = quick add) and Keep notes (`+` = new note).
  - **Reminders ring on the phone** as alarms, app closed or not (no Chrome push needed).
  - **Updates itself:** asks when a newer version is out; Settings › Help › Check for updates.
- Today: past rows no longer fade their time label (hard to read).

## v2.0.2 (2026-11-14) — phone + push fixes, no migration
From v2.0.x: just pull the new image. From v1.1.0: go straight to 2.0.2 (same steps as 2.0.0, SERVICE-HANDOFF §5).
- **Push on Android Chrome:** sent as high priority (sleeping phones held it before) · repeat reminders alert again · PNG icon · the app re-sends this device's push link on every open (server lost it, or VAPID keys changed) · Send a test says why it failed · sign out turns push off on that device.
- **Phone header:** one row (logo · Search · theme · avatar), scrolls away · account menu opens on top.
- **Bottom bar:** real icons (More had none).
- **Today:** timeline starts at the top (first row / now) · current block no longer a white panel · past blocks stay readable.
- **Keep:** title + New note, full-width search, one swipe row of chips, 2 columns · **Shared with me** = shared notes as normal cards ("from X · view only").
- **Pages › Shared with me:** inside Pages with the page tree (old `/shared` forwards there).
- **Settings on phone:** sections = swipe chips, scrolls to the end, wide tables scroll in their card.
- **More:** Pinned pages · Browse · App, like the wireframe.
- Reminder links: block opens your local day (was the UTC day) · archived note opens in Keep archive.
- 404 / error page = card + Go home.

## v2.0.1 (2026-11-14) — fixes, no migration
From v2.0.0: just pull the new image. From v1.1.0: go straight to 2.0.1 (same steps as 2.0.0, SERVICE-HANDOFF §5).
- **Pages look like the wireframes:** page list with New page button, pin icons, tools list · page bar = path · save state · Pin · Share · ⋯ · text in a centred column (database pages full width) · tidy editor spacing, to-do boxes in line, calmer `/` menu.
- **Graph:** nodes were giant circles (graph library default) → normal size, every node named, readable in dark mode.
- **Header pins:** Settings › Preferences › Header pins = reorder (↑ ↓) + Unpin.
- **Phone All pages:** search by title + 5 recent pages.
- **No visible scrollbars** anywhere (scrolling still works).
- Grey helper text was showing in full ink in some places → now grey.
- Pin and Share moved from the page ⋯ menu to the page bar.

---

# v2.0.0

Caveman doc. From v1.1.0. **Migration release** (0003–0008, forward-only). Back up before you pull.

## New
- **Item types** you own: rename, recolour, add up to 10 (5 built-in kept, same data). ★ default type, "counts down" flag. Type bar hides types per person.
- **Preferences**: theme Light / Dark / Auto (by time), timezone, region (week start, 12/24 h), quick-add target, block length. Visible hours follow you to every device.
- **Undo** (Ctrl+Z / toast) for most changes. **Alt-drag** copies a block. Every drag has a button (Schedule…, Start/End).
- **Keep**: notes + checklists (nest 4), images, labels, binders, colours, pin, archive, Trash 30 days, search, Select mode.
- **Pages**: tree, block editor (`/` menu, tables, images, files, to-dos, links to pages), pins in the header (3), archive + "not opened in 90 days", Trash 30 days.
- **Databases** on pages: 8 property types, table view, sort + filters, saved views, records open as pages.
- **Graph** of linked pages (with list view).
- **Ctrl+K** search across Keep, Pages, items + actions.
- **Reminders**: `/remind 1d 2h` in quick add, on items/notes; in-app always, Web Push when the server has VAPID keys.
- **Sharing**: share one page or note with a person (view / edit), revoke any time. "Shared with me" page. Calendar sharing by code unchanged.
- **Phone**: bottom bar, Today (Now card, no-time list, timeline), + Add sheet, Keep, read-first Week + Month, More.
- **PWA**: install to home screen, offline page, offline badge, Keep edits wait offline and send later (clash = both copies kept).
- **Welcome tour** for new accounts (existing accounts skip it) + Settings › Help.
- **Old v1 data** (lists, people, ideas, places, goals, workouts): Settings › Account › "Bring them into Keep" (once, originals kept).

## Changed
- Existing users keep their theme (as a fixed Light/Dark); no tour for them.
- Planner blocks are a focusable group (screen readers), active nav pill readable in dark mode, other-month days readable.
- Request bodies over 1 MB refused (uploads: 25 MB).

## Ops (details in `docs/SERVICE-HANDOFF.md`)
- **Migration** on first boot: 6 SQL files, seconds on a few-MB DB. Rollback = v1.1.0 image + restore the pre-upgrade backup.
- New optional env: `UPLOAD_DIR`, `MAX_UPLOAD_BYTES`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, `JOBS_ENABLED`, `REMINDER_POLL_INTERVAL_MS`. All unset = works, push off.
- New data: `data/uploads/` (files). `backup.sh` / `restore.sh` now include it.
- New outbound: HTTPS 443 to browser push services, only with VAPID keys.
- `/healthz` adds `jobs` and `reminderBacklog`.
- Still one replica (the reminder runner must not run twice).

## Not in v2.0 (→ v2.1)
Live co-edit (a clash shows "changed elsewhere", text kept) · Google Keep Takeout import/export · board/calendar/list/gallery database views · 2-hop local graph · reminders on page to-dos · swipe gestures.

## Known limits / not verified
- Web Push tested on Edge (spike) only; Chrome/Android/iOS and from the homelab through the tunnel = check after deploy.
- Uploads on the real read-only container: covered by design (temp dir on the data volume), not run in Docker on the dev PC.
- Migration rehearsed on a built v1.1.0 DB (`tests/unit/rehearsal.test.ts`, in CI) and on an anonymised copy of the dev DB; **not on a copy of the live backup** (owner's call). Take the backup before pulling.

## Tests at release
Unit 340 · e2e 25 (incl. axe sweep, v1 regression) · lint + types clean · CI green on every phase PR (#5–#14).
