# Review log — 2026-11-06

10 Haiku reviewers, one slice each: auth, sharing, schema, transform script, seed data, deployment, FR→API coverage, cross-doc consistency, wireframes, time/parser. ~170 findings, deduped below. Spot-checked by main agent (seed counts re-run, schema + seed loaded in SQLite with all CHECKs, transform rerun twice = identical ids).

Status: FIXED = in docs/code now. OPEN = owner decision or later.

## Fixed

| Area | Finding | Fix |
|---|---|---|
| Time | Blocks stored local time w/o Z, schema said UTC | transform converts KL→UTC Z; CHECK `LIKE '%Z'` |
| Time | Items mixed date + UTC datetime strings; drag across days shifted by 8 h | items now local `date` + `time` + inclusive `end_date` |
| Time | FullCalendar all-day end exclusive | +1 day mapping rule in lib/time.ts |
| Time | ISO week-year (2026 has W53) | use getISOWeekYear |
| Time | Sleep 23:00–06:00 impossible | blocks may cross midnight, clipped per day |
| Parser | "Sun Tzu" → Sunday, "#spot" → SP, `v1.30` → 01:30, past dates | whole-token rules, dd/mm, rollover, unknown tags stay title |
| Places | Night 17–24 misses supper; empty hours undefined | Night to 02:00 (prev day); [] = hours unknown |
| Auth | Secure cookie breaks Stage B http | Secure from ORIGIN scheme |
| Auth | Spoofable CF-Connecting-IP if port open | remove ports in Stage C; fail closed |
| Auth | Lockout per user+IP only; admin lock-out DoS | add per-IP limit + per-user slowdown |
| Auth | `next` open redirect `//evil` | regex + origin compare |
| Auth | /setup race + reopen when users=0 | BEGIN IMMEDIATE + setup_done flag |
| Auth | No recovery if admin forgets password | reset-password.mjs script |
| Auth | No absolute session cap | 90 d (remember) / 7 d |
| Auth | Invite 40 bits + hint + plain sha256 | 60 bits, HMAC(APP_SECRET), no hint, rate limit, atomic use |
| Sharing | filterBlock leaked hidden item titles via label/item_id | block visible only if linked item visible |
| Sharing | Notes, course, steps leaked to grantee | never sent to grantee |
| Sharing | Client could set calendar_id/created_by/etc. | zod `.strict()`, grantee allowed-field list |
| Sharing | Key normalise order bug (LT prefix) | strip prefix first, len 12 check |
| Sharing | Revoke vs re-redeem undefined | soft revoke, upsert resurrects |
| Sharing | "Plan it" from People leaks surprise to partner | `private` flag, default on from People |
| Sharing | None type not shareable option | added |
| Schema | Missing created_at in seed → insert fail | defaults + transform fills |
| Schema | is_default no uniqueness | partial unique index |
| Schema | Audit FKs block user delete | ON DELETE SET NULL |
| Schema | Missing indexes (owner_id, list_id, person_id, grantee) | added |
| Schema | FTS sync undefined | repo-helper sync rules |
| Coverage | 16 FRs had no endpoint (invites, sessions, password, trash, courses, reorder, log-session, ics rotate, import report…) | API table extended |
| Script | List-item ids depended on row index → churn on re-import | content-only ids |
| Script | Hour 23 → `24:00`; BOM crash; header spaces; bad timestamps | fixed; utf-8-sig; strip; strptime |
| Script | Invented rating 4 for approved places | rating null, approved kept |
| Script | Wrote files before integrity check | check first |
| Deploy | Prod env_file had dev paths | separate `.env.prod.example` |
| Deploy | Bind mount owned by root → CANTOPEN | `chown 1000:1000 data` |
| Deploy | `node build` ignores .env | `node --env-file=.env build` |
| Deploy | Backup on same disk, cron log perms, unsafe restore | off-box rsync required, log in /opt, restore to tmp first |
| Deploy | No TZ, no init, no log rotation, token on cmdline, no rollback, no .gitignore | all added |
| Docs | DATA_DIR vs DATABASE_PATH, .env location, Goals phase, approved rule, naming | aligned |
| Wireframe | Partner colour = Dating ink; partner Busy showed titles; partner items linked | teal user colour, "Busy", not linked (local files) |
| Wireframe | Done fade failed contrast; planner missing 22–23 + Today; both-free wrong | fixed (local files) |
| Wireframe | Login not a real form; Sign out GET link; no Leave; list counts wrong | fixed (local files) |

## Open (owner decides)

1. **Type oddities in your Notion data** (kept as-is): "Flight back to miri" = Exam, "Flight Back to Kuching" = Work, "Birthday Nena" 2026 = Work, "Food fest and send car and stuff" = Exam. Retype after import?
2. **Duplicates** in places: The Podium ×2 (different data), Hainan Village Beef Noodle ×2, Cafe/Kafe Bujang Lelang. Merge by hand.
3. **4 stale "In Progress"** from 2024–25 (Umbrella's of Cherbourg, DCD Assignment 2, Pants design clo3d, Submission of CSAM). Mark done?
4. **Movies in Date ideas** ("Materialists (movie)", "DUNEEEEEEE 3", "Grandma Ong movie") because Notion type was Dating. Move to Watchlist?
5. **Places missing data**: ~56 no cuisine, ~61 no area, 67 no hours. Fine as wishlist?
6. Wireframe fixes (review + audit) are in `wireframes/` on Desktop but NOT yet pushed to the live canvas (needs your OK). Your `Life Tracker Wireframes.pdf` is an export of the OLD canvas → re-export after push.
7. Wireframe gaps not drawn (spec covers them): /setup, Settings Account/Devices/Invites/Users/Goals/Courses/Import, item time fields + Delete + "Keep secret" toggle + full history, People fact edit menu. Draw before P2?
8. Notion page bodies not exported (e.g. "Final Date sama nena" itinerary, "Body Measurements"). Copy by hand if wanted.
9. **Old design spec doc** (Claude Docs "Life Tracker design spec", rev 0) is out of date vs these rev 2.1 docs. Mark superseded or delete?
10. Notion data quirks seen in wireframes (kept as your data): Workouts Chest current "moderate" vs week 1 "light"; Biceps current 8.5 vs week 1 11; "Start of midsemester break" still In Progress.

## Audit round 2 — 2026-11-06 (after chat cut-off)

10 Haiku auditors checked every file vs owner rules: REQUIREMENTS, TECHNICAL, DEPLOYMENT+env, README/REVIEW claims, script+seed vs schema, seed vs raw Notion, desktop wireframes, Desktop vs live canvas, mobile wireframes, PDF. Main agent spot-checked, fixed, re-ran script twice (identical), loaded seed into schema (all 13 tables OK, second import changes nothing).

Clean (no change needed): seed = raw Notion (412 rows accounted, no School type, no invented ratings, all FKs resolve); schema runs; script idempotent; desktop Home = 2/3 + 1/3, colour blocks, one square button, overlap toggle, remember me.

| Area | Found | Fix |
|---|---|---|
| Import | Re-import rule compared `updated_at`, but only items/blocks have it and import stamped now → app edits could be overwritten | FR-IM2 + TECH §10: `ON CONFLICT DO NOTHING` (new ids only, app wins) |
| Script | `_report.json` did not count dropped empty idea row | `source_rows` per source + idea count check |
| Git | `data/` + `!data/.gitkeep` can't re-include (git rule) | `data/*` |
| Docker | `.env*` only matched root; `app/.env` entered build stage | add `**/.env*` |
| Deploy | `.env.prod.example` claimed to exist (not on Desktop) | marked "NOT made yet, create from §0 block" in README, TECH, DEPLOY |
| Deploy | Hard-coded `192.168.1.10`; seed/reset scripts didn't load `.env`; reset had no username; scp in Ubuntu section; prod test left ORIGIN broken | `<homelab-ip>`, `--env-file=.env`, `<username>`, "on PC" label, env override |
| Req | Status said "approved for build"; Desktop folder path missing; partner badge colour vague; invites phase unclear | status = planning done; path added; teal #0F766E; FR-A7 + member reset = P2 |
| Tech | No home for FR-H1 layout, H8 week view, H9 prev/next, Q1 keys, A11 guard, /signup route, PE4/W4/H12 queries; Import UI in P2 but needed for Stage B | all added in §5 + §8; /settings/import → P1 |
| README | No `docs/` row; PDF not mentioned; status overclaimed | rows + status fixed |
| Wireframe desktop | "(P3)" shown on Home; People 13/14 swapped; Places showed invented ★ ratings; Login error text ≠ FR-A9; Ideas used Type colours for channels + "33+"; done dates faded (opacity) | fixed; Places shows "✓ Approved" + empty rating + "Been here" |
| Wireframe mobile | Drawn before your rules: "School / Personal / Relationship" legend, "Deadline" kind, "Area: School", dots, round + 3-segment status, old blues, fake ratings, wrong list counts | Types only, Exam, colour blocks, one square ▶/✓ button, real counts (local files) |
| By design | Login "Sign in" is a link (prototype click-through); real app = submit button | no change |


## Audit 2026-11-09 (after theme + motion)

Scope: whole app (server, API, UI, build, deps). Tools: eslint, svelte-check, `npm audit`, unit 260, e2e 15 (repeated), browser screenshots both themes.

Fixed in PR "month double-click + quick-add fix":
- **High, quick add trapped in header.** Header `backdrop-filter` (theme PR) made `.hdr` the containing block for `position: fixed` children, so the N overlay only filled the header strip. Blur moved to `.hdr::before`. e2e now checks the overlay is full height.
- **Feature: double-click a month day** opens the same command box as a Week drag. Day-only slot (`slot.day`): no time taken from the slot, defaults to `/calendar`, Event type (N-palette default); typed time + `/both` or `/planner` adds a block. API schema accepts `day: true`.

Open (not fixed):
- Medium: Exam chip white on #C6534D = 4.4:1, just under AA for 12 px text. #B84A44 = 5.1:1.
- Medium: e2e flaked once in ~6 runs (one test, passed on rerun, name not captured). Next time: `npx playwright test --repeat-each=5 --trace=retain-on-failure`.
- Low: month double-click is mouse-only. Keyboard path stays the N palette.
- Low: majors available (SvelteKit 3, FullCalendar 7, better-sqlite3 13, TypeScript 7). Pins are on purpose (Windows prebuilds); `npm audit` = 0.
- Low: CSP keeps `style-src 'unsafe-inline'` (Svelte `style:` directives need it). Scripts stay `self` only.
- Low: Ink badge colour (#1C1917) is near-black on dark navy; ring keeps it visible.
- Docs: REQUIREMENTS still names removed wireframe boards (DesktopPlaces/Lists/People/Ideas/Workouts).

Checked, fine: Origin check on every non-GET; session cookie httpOnly + SameSite=Lax + Secure in prod; login guard on all non-public routes; `mustOwn` on every item/block read/write (parent + linked item too); share filtering server-side only (busy ids HMAC'd); notes rendered via marked → DOMPurify (owner-only content); innerHTML only for constant SVGs; timers/listeners cleaned up on unmount; container runs as `node`; CSP + X-Frame-Options DENY.
