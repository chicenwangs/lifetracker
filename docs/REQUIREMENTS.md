# Life Tracker — REQUIREMENTS

Caveman doc. Short. Dense. For Claude when coding later.
Owner: Jeremy (chicenwangs). Rev 2.1, 2026-11-06 (10-agent review + 10-agent audit, see REVIEW.md). Status: planning done. Code not started.

## 0. What + why

- Replace Notion life setup. Self-host. **Desktop first.** Phone = afterthought (P3).
- Notion pain: hour-row planner retype, no half hour, landscape-only timeline, two buttons (Start + Complete), free-tier caps, no proper share with gf.
- One app. Core = calendar + day planner. Side modules: Places, Lists, People, Ideas, Workouts.
- Multi-user. Each person own account. Share calendar by key. Overlap toggle.
- Run localhost first (Windows PC). Then Ubuntu homelab Docker. Then Cloudflare Tunnel public.
- Project folder: `C:\Users\jeremy josh\Desktop\life-tracker` (docs, data, wireframes; app/ made in P1).

## 1. Users

| Who | What they do |
|---|---|
| Jeremy (admin) | Main user. All modules. Makes invite codes. Makes share keys. Manages members. |
| Neina (member) | Own account. Own calendar. Swaps share keys with Jeremy. Sees overlap. |
| Future member | Same as Neina. Invite only. |

No public sign-up. Ever.

## 2. Words

- **Item** = calendar thing with a date. Has Type + Status. Was Notion "Main Database" row.
- **Block** = time slot on day planner. Start + end, 15-min snap. May link to Item.
- **Type** = Work | Exam | Event | Hobby | Dating. No "School" (school = Work). **Exam = any hard deadline / assessment / submission.** Null allowed = grey "None".
- **Status** = todo | doing | done. One square button cycles.
- **Calendar** = bucket of Items + Blocks. Each user has 1 default. Unit of sharing.
- **Share key** = one-time code `LT-XXXX-XXXX-XXXX`. Gives other user access to your calendar.
- **Grant** = live permission after key redeemed.
- **Overlap** = show granted calendars on top of yours.
- **Private item** = "Keep secret" item. Always Busy to others.

## 3. Priorities

Rev 2026-11-08 (owner):
- **P1** = core daily loop + auth + import. Desktop only. Done.
- **P2** = ship + test with real users. Order: homelab Docker (DEPLOYMENT B) → Cloudflare Tunnel (C) → only then invite users → test the core loop + sharing together, fix what that finds.
- **Not in this app:** Places, Lists, People, Ideas, Workouts (§4.6–4.10). If built, each is its own service on its own subdomain. Sections kept as reference only. Import still loads their data; nothing shows it.
- **P3** = search, calendar feed, automation, mobile, PWA.

## 4. Functional requirements

### 4.1 Auth (P1)

- FR-A1 Login page: username + password + "Remember me on this device" checkbox (default ON). Wireframe `Login.dc.html`. Real `<form method=post>`.
- FR-A2 Remember ON → session 30 days sliding (renew when < 15 d left), hard cap 90 days from login → then log in again.
- FR-A3 Remember OFF → browser-session cookie + server 12 h idle expiry (truth = server; some browsers restore session cookies). Hard cap 7 days.
- FR-A4 Logout = POST. "Sign out everywhere else" kills all other sessions, keeps current.
- FR-A5 Settings > Devices: user agent short, created, last seen, remember flag, revoke one.
- FR-A6 First run `/setup` (only before setup done): needs `SETUP_TOKEN` env. Creates admin + calendar. After: `/setup` 404 forever (flag in DB, not "user count = 0").
- FR-A7 (rev 2026-11-08) Sign-up page `/signup` (login page tab). **Open by default**: anyone makes their own account (5 per IP per 15 min). Admin can switch to **invite-only** in Settings > Users; then `/signup` asks for `INV-XXXX-XXXX-XXXX` (made there, 7 days, shown once, cancel, single use).
- FR-A8 Password 10–128 chars. Reject top-1000 common list. No other rules.
- FR-A9 Lockout: 5 fails per (username, IP) in 15 min → that pair locked 15 min. 30 fails per IP in 15 min → IP locked. Many fails on one username from many IPs → slow down (2 s each), never hard-lock (attacker can't lock admin out). Message always "Wrong username or password. N tries left." Locked: "Too many tries. Try again in M min." Same for unknown user.
- FR-A10 Change password (needs current). Kills other sessions, rotates current.
- FR-A11 Every page + API needs session except `/login /signup /setup /healthz /cal/:token.ics` + static. No session → `/login?next=` (same-origin paths only).
- FR-A12 Locked-out admin recovery: `reset-password` script inside container (DEPLOYMENT). Admin can reset member passwords (Settings > Users, P2).

### 4.2 Home: calendar + planner (P1)

- FR-H1 Desktop Home = month calendar left 2/3, day planner right 1/3 (`Desktop.dc.html`). Under ~1000 px wide → planner drops under calendar.
- FR-H2 Month view, Monday start. Items = **full colour blocks** by Type (not dots). Title ellipsis. Square status button left of title.
- FR-H3 Square: empty = todo, ▶ = doing, filled + ✓ = done. Click cycles todo→doing→done→todo. Tooltip says next action. Space/Enter when focused.
- FR-H4 →doing sets `started_at`, →done sets `completed_at`, →todo clears both.
- FR-H5 Done: line-through + filled square. Stays visible. No fading (contrast).
- FR-H6 Drag item to other day = change date, keep time. Undo toast 5 s.
- FR-H7 Click own title → Item detail (`DesktopItem.dc.html`). Partner item → read-only card.
- FR-H8 Month/Week toggle. Week (`DesktopWeek.dc.html`) = 7-col time grid + all-day row; right 1/3 = "Due soon, no time blocked" + "Unscheduled (no date)".
- FR-H9 Planner: one day, portrait, 00:00–24:00, opens scrolled to 07:00, 07–23 visible. Now line. Prev/next/Today.
- FR-H10 Blocks: drag empty → create; drag edges → resize; drag body → move. Snap 15 min, min 15 min. Can cross midnight (shown clipped per day). Square cycles block status.
- FR-H11 Block colour: linked item Type → block own Type → grey.
- FR-H12 "Due today" chips above planner (dated today, not done). Drag chip onto grid → block linked to item, 60 min.
- FR-H13 Drag month item onto planner → same as H12.
- ~~FR-H14 Q4 goals~~ removed 2026-11-08.
- FR-H15 Header: nav (only pages already built), quick add, search (P2), avatar → Settings.
- FR-H16 Undated items = "Unscheduled" list (Week right panel). Imported: "Her Birthday".

### 4.3 Quick add (P1, rev 2026-11-06b "planner first"; P3 extras)

- FR-Q1 Header "+ Add N" button. Key `N` (not while typing in a field) opens a chat-style palette: log of what was added (Undo each), input, slots, footer keys. Enter adds, Esc closes menu → clears text → closes palette, ↑ on empty = last line. Palette stays open for batch adding.
- FR-Q2 Grey ghost text = format guide `title  day  time   optional: /type  /calendar or /both`, shrinks to the missing slots, completes a half-typed option. Labelled slots (Type, Title, Goes to, Day, Time) fill live; defaults dashed + "default". **No errors while typing.** On Enter each problem shows at the bottom: what's wrong + how to fix.
- FR-Q3 Any order. Options start with `/`: types `/work /exam /event /hobby /date`; destinations `/calendar` (`/cal`), `/both`, `/planner` (= default). `/` opens a small menu at the cursor (↑↓, Enter/Tab, click, filters, tick on picked). Days + times need no prefix. Leftover words = title. Defaults: Event, planner, today (timeline drag with no type = None, grey). `#word` is plain title text. Unknown `/x` = problem. Grammar TECHNICAL §8.
- FR-Q3a **Where it goes.** Default = **planner only**: a time block, no calendar item (fillers like "drive to X" keep the month clean). Needs a time. `/calendar` = calendar item only (big events, time optional, end time ignored). `/both` (or `/calendar /planner`) = calendar item + linked block, one transaction. Blocks snap 15 min, single time = 60 min, end ≤ start = crosses midnight.
- FR-Q3b **Days** (common English + typos): today/tonight/this evening, tomorrow (+ tommorow, tmrw, 2moro …), day after tomorrow, yesterday, in 3 days / in a week / in a fortnight / in 1 month, 3 days from now, a week from tomorrow, weekday names (+ typos: wensday, thrusday …; plurals like "tuesdays" stay title), `next mon` = the coming Monday (never today) and each extra `next` +1 week, `this sat`, next week (= its Monday), `fri next week` (that week's Friday), this/next weekend, next month (= 1st), end of month / eom, 16 nov · 16th of november · nov 16th, 2027 · the 16th · 16/11 (D/M; 11/16 read US only when it can't be D/M) · 2026-11-16, month typos (febuary, novemeber …). A weekday next to a date belongs to it ("Mon 16 Nov", mismatch = warning). Glue words `on at by from between` around a day/time are dropped from the title. Punctuation ignored ("tomorrow," "fri.").
- FR-Q3c **Times**: 6pm · 6 pm · 6:30 p.m. · 18:30 · 18.30 · 18h30 · noon/midday/midnight · ranges `6pm to|till|until|- 8pm`, `6-8pm`, `6 to 8pm`, `from 6pm to 8pm`, `between 6 and 8pm`, `18:00-19:30` · durations `for 2h | 90m | 1h30 | 2 hours | an hour | half an hour` · `all day`.
- FR-Q4 (P3) `every mon,wed` → recurring (rrule + skip dates).

### 4.4 Item detail (P1)

- FR-I1 Fields: title, Type, date, optional time, optional end date (inclusive), status, notes (markdown), "Keep secret from shared calendars".
- FR-I2 Steps = child items. Progress bar + "n/m done". Add step. (P3: apply step template.)
- FR-I3 Linked time blocks listed. "Block time" → planner on item date.
- FR-I4 History: created, started, completed, edited by.
- FR-I5 Delete → confirm → soft delete with steps + blocks. Trash page, restore 30 days, then purged. (P2)

### 4.5 Sharing + overlap (P2)

- FR-S1 Settings > Sharing (`DesktopSharing.dc.html`).
- FR-S2 Make key (rev 2026-11-08: **view only**, edit grants not built): expiry (24 h | 7 d, enforced server), visible types (Work, Exam, Event, Hobby, Dating, None, Blocks), hidden-as ("Busy" | nothing). Key shown ONCE. Copy.
- FR-S3 Key `LT-` + 12 Crockford base32 chars (60 bits). Server stores HMAC only, no hint.
- FR-S4 Single use. Redeem → grant. Bad/expired/used/revoked → one generic error.
- FR-S5 Redeem: 5 bad tries per user per 15 min.
- FR-S6 Can't redeem own key. Redeem again on same calendar = replace settings (also re-opens a revoked grant).
- FR-S7 Mutual = both make + both redeem.
- FR-S8 Owner: "Who can see my calendar" → edit settings, remove. Unused keys → cancel.
- FR-S9 Grantee: "Calendars I can see" → include in overlap toggle, leave.
- FR-S10 Home calendar header **Overlap** toggle (pill + avatars + switch). Default ON. ON = show all grants with include-in-overlap. Saved per user on server.
- FR-S11 Partner items: striped in Type colour, dashed border, initial badge in partner's user colour (default teal #0F766E; never a Type colour). View → no square, no drag, not clickable to edit. Edit → square + drag.
- FR-S12 Planner overlap ON: partner blocks sit beside mine (column packing), striped + badge, read-only. (Lanes "Me | <name>" deferred.)
- FR-S13 Server filters. Hidden types → "Busy" (times only) or nothing. **Never sent to grantee: notes, steps, parent, hidden titles.**
- FR-S14 (P3) "Both free" green band: gaps ≥ 60 min, 08:00–22:00, across all lanes.
- FR-S15 Only calendar (items + blocks) shareable. Places, Lists, People, Ideas, Workouts private. **People module never visible to anyone else.**
- FR-S16 Grantee edits set `updated_by`. Owner sees "edited by N".
- FR-S17 Private items ("Keep secret") always Busy to every grantee. Items made by "Plan it" from People default to private (surprise gifts stay secret).
- FR-S18 (deferred: grants are view-only) Edit grant can: cycle status, move date/time, move/resize blocks, rename. Cannot: create in owner calendar, delete, change type/notes/private.

### 4.6 Places (moved out: separate service, reference only)

- FR-P1 Filters sidebar + table (`DesktopPlaces.dc.html`).
- FR-P2 Fields: name, city, areas[], cuisines[], open_when[] (Morning | Night | All Day), closed_on[] (Mon..Sun), halal, visited, approved (Notion Stamp of Approval, own flag), rating 1–5 or empty (none imported), notes, last_visited.
- FR-P3 Filters: city, open now, not visited, halal, approved, rating ≥ N, area chips, cuisine chips, text.
- FR-P4 Open now (user tz): Morning 06–12, All Day 06–24, Night 17:00–02:00 (after-midnight part counts as previous day). Empty open_when = "hours unknown" (not in Open now). Empty closed_on = open daily.
- FR-P5 "Pick one for me" = random from current filter.
- FR-P6 Inline star rating (radio group). "Been here" button → visited + last_visited today.
- FR-P7 Duplicate warning on add/rename (same city, case-insensitive, cafe≈kafe).

### 4.7 Lists (moved out: separate service, reference only)

- FR-L1 Sidebar of lists + checklist (`DesktopLists.dc.html`).
- FR-L2 Generic lists. Imported: Watchlist 6, Date ideas 14, Games to play 33, Soundtrack inspiration 26, chicenwangs2 rules 2.
- FR-L3 Item: text, done, note, link (clickable). Done collapses.
- FR-L4 "Plan as a date" → Dating item on picked date; list item links it.
- FR-L5 Drag reorder lists + items. New, rename, delete (confirm).

### 4.8 People (moved out: separate service, reference only)

- FR-PE1 Person page with category cards: likes, info, hates, wants, bucket list, misc (`DesktopPeople.dc.html`).
- FR-PE2 Facts add/edit/delete.
- FR-PE3 "Plan it" on fact → Dating item, private by default (FR-S17). Fact links item.
- FR-PE4 Side panel: own Dating items done (newest first) + Date ideas list preview.
- FR-PE5 Private (FR-S15).

### 4.9 Ideas (moved out: separate service, reference only)

- FR-ID1 Board (`DesktopIdeas.dc.html`): Idea, Filmed, Edited, Posted. Drag between + reorder; keyboard move buttons.
- FR-ID2 Channel filter All | chicenwangs | chicenwangs2. Neutral channel tags (not Type colours).
- FR-ID3 Warn (not block) when chicenwangs2 title > 70 chars.
- FR-ID4 Dump box adds to Idea column, current channel.

### 4.10 Workouts (moved out: separate service, reference only)

- FR-W1 Split table weekday → exercises (`DesktopWorkouts.dc.html`). Edit split.
- FR-W2 Log: date, exercise, kg, effort (light|moderate|heavy), optional sets, reps.
- FR-W3 Today panel: today's split, last logged kg prefilled (else split current_kg), ±0.5 kg.
- FR-W4 Progress = last 4 ISO weeks (current week counts) from logs. Notion weeks shown as "Before app".
- FR-W5 "Log session" saves logs + marks today's block labelled "Workout" done (if any).

### 4.11 Goals — removed 2026-11-08

- Goals and Courses were removed from the app. DB tables `goals`, `courses` and `items.course_id` are kept dormant (data untouched); seed import ignores them.

### 4.12 Search (P3)

- FR-SR1 One box. Own item titles+notes, places, list items, facts, ideas. Grouped results.

### 4.13 Calendar feed (P3)

- FR-F1 Secret `.ics` URL per user (`/cal/<token>.ics`), own items only. Rotate button (old URL dies).

### 4.14 Import (P1)

- FR-IM1 Dev: `npm run db:seed -- --owner jeremy`. Prod: Settings > Import (admin, owner dropdown). Both read `data/seed/*.json` from `scripts/transform_notion.py`.
- FR-IM2 Idempotent. Re-import inserts new ids only; existing ids never touched (app edits always win). Second import changes nothing.
- FR-IM3 Settings > Import shows `_report.json` counts + warnings.

### 4.15 Mobile (P3)

- FR-M1 Responsive mobile layout per mobile wireframes.
- FR-M2 PWA manifest + icons + service worker. Installable. Offline read-only shell.

## 5. Non-functional

- NFR-1 Perf: Home < 1.5 s LAN, < 3 s tunnel. Month JSON < 100 KB.
- NFR-2 Data: one SQLite file, WAL, nightly off-box backup, restore tested.
- NFR-3 Security: TECHNICAL §5, §7, §11.
- NFR-4 Privacy: no telemetry. Only external runtime call = Google Fonts (self-host in P2).
- NFR-5 A11y: real buttons/forms/labels, focus ring, text 4.5:1, input borders 3:1, colour never alone (badge + stripes + text).
- NFR-6 Browser: latest Chrome/Edge/Firefox desktop. Mobile in P3.
- NFR-7 Time: items = local date (+time) in owner tz; blocks + timestamps UTC. Default tz Asia/Kuala_Lumpur. Monday weeks. TECHNICAL §3.
- NFR-8 Restart safe. Migrations forward-only on boot.
- NFR-9 TypeScript strict, lint, tests (TECHNICAL §12).

## 6. Acceptance

P1:
- [ ] Fresh DB → /setup with token → admin. /setup then 404.
- [ ] Remember ON: cookie has Max-Age, survives browser restart, next day still in. OFF: no Max-Age; idle 12 h → logged out.
- [ ] 5 bad passwords same IP → locked msg with minutes.
- [ ] Import: items 391, places 130, lists 5, list_items 81, facts 24, ideas 63, split 11. Matches `_report.json`. Second import changes nothing.
- [ ] Nov 2026 month shows colour blocks. Square cycles + persists.
- [ ] Planner: drag 13:00–14:30 block, resize to 14:45 (15-min snap). Block 23:00–06:00 shows on both days.
- [ ] Drag "DS Quiz" chip to 13:00 → linked red block.
- [x] Quick add `ds quiz fri 2pm /exam /calendar` → Exam item, Fri 14:00 (next Fri if past). `drive tommorow 6:07pm to 8pm` → planner block only 18:00–20:00. `/both` → item + linked block.
- [ ] reset-password script works.

P2 (on the tunnel URL, real devices):
- [ ] Homelab: `docker compose up -d` → /setup → import → app survives reboot. Nightly backup restores.
- [ ] Tunnel: https://lt.<domain> works, `__Host-lt_session` Secure cookie, no LAN port open.
- [ ] Neina makes her own account on her device. Jeremy code (Dating+Event, rest Busy) → Neina enters it → overlap shows Jeremy Dating/Event titles, other types "Busy", no notes; hidden titles absent from network JSON. Then mutual.
- [ ] Private item shows Busy even if Type visible.
- [ ] Overlap toggle persists across reload + devices.
- [ ] Revoke → access gone next request. Re-redeem new key → access back.
- [ ] Neina gets 404 on every Jeremy item/block id (open, edit, delete).
- [ ] One week of both using the core loop daily; issues logged and fixed.

P3:
- [ ] .ics feed loads in Google Calendar. Rotate kills old URL.
- [ ] Installs as PWA on phone.

## 7. Out of scope (v1)

OAuth, email, push, sharing non-calendar modules, real-time sync (60 s poll ok), Notion page body text, native app, multi-timezone couples (both users KL; per-user tz stored for later).
