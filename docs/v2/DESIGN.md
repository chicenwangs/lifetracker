# Life Tracker — DESIGN (how)

Caveman doc. Rev 1.1, 2026-11-12. Compact of Technical Design v1.0 + error fixes (FIX LOG end).
Read PRD.md + FEATURES.md first. Existing stack/rules = repo TECHNICAL.md (+ P1-NOTES overrides). Ops = repo SERVICE-HANDOFF.md. Decisions = PRD §12. Milestones = PRD §13.
Target design, not built yet. **Spike** = prove before committing.

## 1. Baseline (live v1.1.0 — don't break)

- TS strict · SvelteKit 2 (pinned) + Svelte 5 runes · Node 22 (not 24) · adapter-node · SQLite `better-sqlite3` 12.11.1 pinned · Drizzle (`0000_init.sql` hand-patched; recheck after generate) · zod · argon2id · FullCalendar v6 MIT · own DayPlanner · date-fns + @date-fns/tz · marked + DOMPurify · Vitest + Playwright · plain CSS tokens.
- Image `ghcr.io/chicenwangs/lifetracker:X.Y.Z` via tag → CI → GHCR. Container: uid 1000, read-only rootfs, writable `/app/data` (volume) + `/tmp` (tmpfs), one replica.
- Time: item `date`/`time`/`end_date` = owner-local, inclusive end; block start/end + all `*_at` = UTC `Z`. FullCalendar all-day end +1 only in `lib/time.ts`. Never `new Date('YYYY-MM-DD')`.
- Repo layer owns SQL + scoping. Routes never build SQL. Never trust client owner/user/calendar/audit fields. zod `.strict()`.
- Migrations forward-only on boot. Keep every existing table incl. dormant (goals, courses, places, lists, list_items, people, person_facts, ideas, workout_split, workout_logs, step_templates). Drop = separate task + backup.
- API convention stays existing: success = plain JSON object; error = `{error:{code,message}}`; 401/403/404(not yours too)/409/429. New endpoints follow it. (v1.0 TDD proposed a new `{data,meta}` envelope → dropped, would split the API.)

## 2. Shape

One SvelteKit process. Modular monolith. Same SQLite file. Private uploads dir. In-process job runner.

```
route (parse, auth) -> service (rules, txn) -> repo (SQL, scoping) -> SQLite
component -> lib/client/api -> route
```
Banned: component → server code · route → SQL · repo → component · Keep code touching Pages tables (go through service) · client owner ids.

Why: few users, one box. No brokers, no distributed txns. Postgres/worker split = future, not needed for Keep/Pages.

## 3. Code layout (extend, don't replace)

```
lib/server/
  access/      planner.ts (move existing access.ts here) keep.ts pages.ts attachments.ts
  services/    planner keep pages database search graph attachment reminder push undo import-export
  repo/        existing + keep-{notes,checklists,labels,binders} pages page-{blocks,links,shortcuts}
               databases database-{properties,records,values,views} attachments reminders
               push-subscriptions page-shares keep-shares undo-actions
  validation/  planner keep pages databases attachments reminders sharing
  jobs.ts      job runner
lib/components/{shared,planner,keep,pages,database,graph}
lib/client/{api,toast,undo,preferences,offline}
routes/keep/  routes/pages/  routes/api/{keep,pages,databases,attachments,reminders,push,undo,page-shortcuts}
tests/{unit,integration,e2e}
docs/adr/
```

## 4. DB rules

- Pragmas: WAL, foreign_keys ON, busy_timeout 5000, synchronous NORMAL.
- Txn for every multi-row change (page + first block, item + blocks delete, note + labels/binders, record + values, attachment ref, undo apply + mark, reminder claim). Never hold write txn over network/file I/O/push/layout.
- Ids: prefix + 16 base32 (80 bits). New prefixes `kn_ kci_ kb_ kl_ pg_ pbl_ pdb_ pdp_ pdr_ pdv_ att_ atr_ rem_ psub_ und_ shr_`. Id ≠ permission.
- Timestamps UTC `Z`; dates `YYYY-MM-DD`; tz IANA. Reminders store resolved `due_at` UTC + the rule.
- JSON columns only for versioned block content, drawing strokes, small configs, undo snapshots. zod-validated + `json_valid`. Never a whole workspace/DB in one JSON.
- Ordering: `position_key` (fractional text key) for page blocks, Keep notes, checklist items, binders, labels, records. Tie-break by id. Rebalance in short txn when keys run out. (v1.0 used int `sort_order` for Keep → every reorder rewrites rows; switched.)

## 5. Schema adds (logical; reconcile with Drizzle)

**users (add columns, same pattern as existing `theme`, `plan_mode`, `overlap_on`):**
`theme_mode TEXT CHECK in('light','dark','auto')` (migrate from `users.theme`, keep each user's current look) · `theme_light_start TEXT DEFAULT '07:00'` · `theme_dark_start TEXT DEFAULT '17:00'` · `tour_state TEXT CHECK in('new','skipped','done')` (migration sets existing users `'done'`; later sign-ups default `'new'`; anyone can restart from Help). Reuse existing `users.timezone`. Planner defaults (SYSTEM-AUDIT): `region TEXT CHECK in('my','us') DEFAULT 'my'` · `qa_target TEXT CHECK in('timeline','calendar') DEFAULT 'timeline'` · `block_min INT CHECK in(15,30,45,60,90) DEFAULT 60` · `visible_hours TEXT DEFAULT '7-24'` (cookie `lt_hours` becomes first-paint cache only; PATCH on roll release). New accounts `theme_mode='auto'`. No separate prefs table.

**item_types** `id (ity_), owner_id CASCADE, key TEXT, name TEXT, bg TEXT, ink TEXT, slug TEXT, position_key, builtin INT, share_default INT, created/updated_at`. UNIQUE(owner,key), UNIQUE(owner, slug COLLATE NOCASE). Max 10 per owner (service + count check in txn). Built-ins seeded per user on migration with keys `work exam event hobby dating` (labels Work, Deadline, Event, Hobby, Date) so old data maps 1:1. `ink` computed from bg (white/navy, best contrast ≥4.5:1) and stored. Flags: `counts_down INT DEFAULT 0` (seed: exam=1), `is_default INT DEFAULT 0` (seed: event=1) with partial UNIQUE(owner_id) WHERE is_default=1. Code rule: no string compare on type names anywhere — `time.ts` countdown reads `counts_down`; quick add default reads `is_default`; remove `TYPES`/`SHARE_KINDS` constants (`schema.ts`, `types.ts`, `seed.ts`, `MonthCalendar`, sharing page) in favour of the user's `item_types` from page data.
Migration: `items.type` / `blocks.type` CHECK(IN 5 names) → **table rebuild** to `type_key TEXT NULL` (FK-free, validated in service against owner's item_types; NULL = No type). Copy values lower-cased. `share_keys.visible_types` / `grants.visible_types` JSON keep keys (`work`…, plus custom keys, `none`, `blocks`). Partner view renders a custom type it doesn't know as Busy colour + name only if visible. Delete type = txn: move items/blocks to target key, delete row, undo snapshot.
Per-user hidden-type filter: `users.hidden_types JSON` (client-side filter of the calendar feed; server still sends all own rows).
API: `GET/POST /api/item-types`, `PATCH/DELETE /api/item-types/:id {moveTo}`, `POST /api/item-types/reorder`.

**page_shortcuts** `(user_id, page_id, slot 0..2, created_at)` PK(user,page), UNIQUE(user,slot). Reorder = `PUT` full list → delete user rows + insert in one txn (UNIQUE(slot) breaks in-place swaps). Service checks access + ≤3.

**pages** `id, owner_id, parent_page_id → pages ON DELETE SET NULL, title DEFAULT 'Untitled', icon, cover_attachment_id → attachments ON DELETE SET NULL, position_key, archived_at, archived_batch, last_opened_at, deleted_at, deleted_batch, created/updated_at, created_by/updated_by → users SET NULL, revision INT`. Idx (owner,parent,position_key), (owner,updated_at), (owner,archived_at), (owner,last_opened_at). Archive = set `archived_at` + `archived_batch` on page + all descendants in one txn (recursive CTE); restore by batch. Sidebar/pins/search queries add `archived_at IS NULL`; graph and link resolution do not. Pin rows for archived pages deleted in the same txn. `last_opened_at` written at most once per hour per page (no write storm). Suggestions = `last_opened_at < now-90d AND archived_at IS NULL`, computed on request, dismissals stored per user (`page_archive_dismissed(user_id, page_id, until)`). Parent same owner. Cycle check walks ancestors in service (recursive CTE). Soft-deleting a parent soft-deletes subtree in same batch (D-18).

**page_blocks** `id, page_id CASCADE, parent_block_id CASCADE, block_type, position_key, content_json (json_valid), schema_version, created/updated_at/by`. Idx (page,position_key), (parent). No bytes, no auth data in JSON.

**page_links** (projection of link blocks, rebuildable) `id, source_page_id CASCADE, target_page_id CASCADE, source_block_id CASCADE, created_at`. UNIQUE(source_block_id, target_page_id). `source_block_id` NOT NULL (v1.0 allowed NULL → SQLite treats NULLs distinct → dup rows). Hierarchy NOT stored here (it's `pages.parent_page_id`).

**keep_notes** `id, owner_id, note_type in(text,checklist,image,drawing,link), title, body_json, url, color, background_key, pinned INT, position_key, archived_at, deleted_at, deleted_batch, created/updated_at, revision`. Idx (owner,deleted_at,archived_at,pinned,position_key). Type/content combo checked in service. Files attach to any type via refs (no `attachment` type).

**keep_checklist_items** `id, note_id CASCADE, parent_item_id CASCADE, text, checked INT, position_key, created/updated_at`. Same note only, depth ≤ D-10, cycles rejected.

**keep_labels** `id, owner_id, name, color, position_key, created_at, UNIQUE(owner, name COLLATE NOCASE)` · **keep_note_labels** PK(note,label) both CASCADE.
**keep_binders** `id, owner_id, name, position_key, created/updated_at` · **keep_note_binders** `(note_id, binder_id, position_key)` PK(note,binder) both CASCADE.

**page_databases** `id, owner_id, page_id CASCADE, title, created/updated_at, revision`.
**database_properties** `id, database_id CASCADE, name, property_type in(title,text,number,date,checkbox,select,multi_select,url), config_json, position_key, required INT, created/updated_at`. One `title` prop per DB (service). Select options = `{id,label,color}` in config; values store option **ids**.
**database_records** `id, database_id CASCADE, page_id → pages SET NULL, position_key, created/updated_at, revision`. Record page created lazily on first open, in txn. Delete record → its page goes to trash same batch.
**database_values** PK(record,property) both CASCADE, `value_json, updated_at`. Service checks record + prop same DB.
**database_views** `id, database_id CASCADE, name, view_type in(table,board,calendar,list,gallery), config_json (versioned per type), position_key`.

**attachments** `id, owner_id CASCADE, storage_key UNIQUE, original_name, mime_type, byte_size, sha256, status in(uploading,ready,quarantined,failed), created_at, deleted_at`.
**attachment_refs** `id, attachment_id → attachments CASCADE, owner_id CASCADE, source_type in(keep_note,page_block,page_cover), source_id, created_at, UNIQUE(attachment,source_type,source_id)`. (v1.0 had `RESTRICT` on attachment_id → user delete cascades attachments, refs block it → user delete fails. Now CASCADE; "don't delete referenced file" enforced in service.) Polymorphic source → service validates existence + write access; source delete removes refs in same txn.

**reminders** `id, owner_id CASCADE, source_type in(planner_item,planner_block,keep_note,page_block,database_record), source_id, rule_kind in(relative,absolute), rel_value, rel_unit in(minute,hour,day,week), due_at, status in(scheduled,processing,sent,failed,cancelled,missed), attempts, last_error, claimed_at, sent_at, created/updated_at`. Idx (status,due_at), (source_type,source_id). UNIQUE(source_type,source_id,due_at) = no dup (FEATURES §9).

**push_subscriptions** `id, user_id CASCADE, endpoint_hash UNIQUE, endpoint, p256dh, auth, user_agent, created_at, last_success_at, revoked_at`. Endpoint + keys = secrets: never logged.

**undo_actions** `id, user_id CASCADE, seq, action_type, label, target_type, target_id, before_json, after_json, expect_revision, created_at, expires_at, undone_at`. Idx (user,seq DESC), (expires_at). Expiry = session-length (12 h). Minimal snapshots only. Purged on expiry and on user's sign-out-everywhere.

**page_shares / keep_note_shares** `id, resource_id CASCADE, owner_id, grantee_id CASCADE, permission in(view,edit), granted_by, created_at, revoked_at, UNIQUE(resource,grantee)`. Separate from calendar `grants`. No inheritance column until D-01..D-03.

**search** → replace dormant `search_fts` (never wired) with:
`CREATE VIRTUAL TABLE content_search USING fts5(owner_id UNINDEXED, kind UNINDEXED, ref_id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2')`. Migration drops `search_fts` (empty) + creates this.

Migration order: users cols → attachments → pages → page_blocks → page_links → page_shortcuts → keep_* → page_databases … → reminders → push → undo → shares → content_search.

## 5b. De-hard-wiring checklist (from v1.1.0 code)
- `time.ts:175` `type !== 'Exam'` → `!typeOf(i).counts_down`.
- `quickadd.ts:814` default `'Event'` → ctx.defaultType; `:345` duration 60 → ctx.blockMin; destination default → ctx.qaTarget; date order → ctx.region.
- `MonthCalendar`/`WeekCalendar` `firstDay: 1`, `hour12:false` → from region.
- `DayPlanner`/`WeekCalendar` drop = 60 min → blockMin.
- `client/hours.svelte.ts` cookie write → also PATCH `/api/me/prefs {visible_hours}`.
- `colors.ts USER_COLORS` (4) + copy in `api/me/prefs` → one exported list of 8 (#1C1917 #0F766E #6D28D9 #B45309 #1D4ED8 #BE123C #4D7C0F #0E7490), never a type colour.
- `env.ts`/`schema.ts` KL default stays as *default* only; timezone picker writes `users.timezone`.
- Tests: every default reproduces v1.1.0 output (snapshot quickadd table with ctx = defaults).

## 6. Pages editor

- Page = metadata + ordered typed blocks. Never one HTML blob.
- Editor: **Tiptap (ProseMirror)** pending Spike S-1: Svelte 5 mount/destroy no leaks · JSON round-trip · stable selection under Svelte updates · `/` menu as extension · block select/move/dup/delete · theme tokens · self-hosted only (no Tiptap cloud). Fail → re-evaluate, never hand-roll rich text.
- Block registry per type: name, schema_version, zod schema, editor + read-only renderer, (de)serialize, toolbar, search/graph projection, migrate(old→new).
- Autosave: debounce (~600 ms) + blur → send changed blocks + `expectedRevision` → server validates access/schema/revision → txn → revision+1 → client "saved". Fail → keep local, show error, retry; never overwrite local with stale server.
- Conflict (private + sequential share): revision mismatch → 409 + current revision; client keeps draft, offers reload/compare/retry. Real-time co-edit = D-05 (Yjs spike), not in M3.
- Render: only known schemas; imported HTML → DOMPurify; safe URL schemes; links `rel="noopener noreferrer"`; no scripts/handlers/unsafe embeds.

## 7. Databases

- Simple table = one block's JSON. Database = rows in §5 tables. Never mixed.
- Validation per type: title non-empty, ≤300 · text ≤10k · number finite · date strict `YYYY-MM-DD` · checkbox bool · select existing option id · multi-select existing ids, deduped · url `http(s)/mailto`.
- Query: filters/sorts from validated view config only, mapped to known props + known operators. No raw SQL/column names from client. Bounded page size (default 100, max 500). For small DBs OK to filter in app code after bounded load.
- Relations later: explicit relation rows (src db/record, dst db/record), access checked both ends. Formulas: constrained expression language, no JS eval, recursion limit — separate spec.

## 8. Keep

- Own routes/components/services. Reuses auth, access, attachments, reminders, undo, search. Not the Pages editor (stay light).
- Text body = versioned light rich-text JSON. Checklist = rows. Image = refs. Drawing = versioned vector strokes JSON (+ optional cached PNG). Link = url + preview meta.
- List query: owner scope → archive/trash/pinned filter → label/binder via `EXISTS` (no dup rows) → order → page.
- Archive `archived_at`, trash `deleted_at`, permanent = hard delete cascade, files GC'd later if unreferenced.
- Build a Kept parity sheet in M0: each feature → M2 / later / native-only / decision. Behaviour reference only, no code/branding copy.

## 9. Search

- One FTS5 projection (`content_search`). Sources: Keep title/body/checklist, Page title + text blocks, DB title/text values (if approved), planner titles/notes later.
- Update in same txn as source: create/update upsert · trash/delete remove · restore re-add · archive keeps row, filtered by scope (Keep archive and Page archive both excluded by default, `includeArchived` flag opts in). Admin "rebuild index" command.
- Index ≠ permission. Results re-filtered by access service; open re-checks.
- Result: kind, id, title, short safe snippet (`snippet()`), updated_at, route. No full content.

## 10. Graph

- Read model from pages + page_links (+ relations later). Not stored separately. Includes archived pages with `archived:true` flag; client styles + filters them.
- Scale target (second brain): plan for 5k nodes / 20k edges on desktop. Server sends compact arrays; layout in a Web Worker; WebGL/canvas renderer if SVG/DOM can't hold it (S-2 must test at this size).
- Service: accessible pages → parent edges + link edges → DTO `{nodes:[{id,title,kind,route,parentId?}], edges:[{id,source,target,relation}], generatedAt}`. Edge to inaccessible page = dropped (no id/title/count). No content/files/secrets in DTO.
- Browser does layout. Library pending Spike S-2: Svelte 5 OK, keyboard node select, pan/zoom, smooth at target size (set in M0, e.g. 2k nodes), no runtime service, mobile fallback. Fallback = list/tree.
- Caps: max nodes per response, local graph mode. Cache key must include user (permissions); share change invalidates.

## 11. Undo + Alt-drag

- Per-user journal. Service op that supports undo: check access → capture minimal before → mutate in txn → capture after/revision → insert `undo_actions` same txn → return `{undoId,label}`.
- Undo: newest unexpired not-undone → check current state matches recorded after/revision → inverse in txn → mark undone → return label. Mismatch → refuse "can't undo safely".
- Client: global keydown; skip when target is input/textarea/contenteditable/editor/canvas; `POST /api/undo`.
- Not undoable: permanent delete, push sent, imports.
- Alt-drag: client sends `{duplicate:true, target}`; server copies via per-type field **allowlist** (D-09). Never copy ids, owner, audit, shares, reminders, attachment grants. One undo entry. Windows: `preventDefault` Alt keyup during drag.

## 12. Files

- Store `/app/data/uploads/<2-char>/<storage_key>`. Never under `static/`. No public path.
- **Temp files in `/app/data/uploads/.tmp/`, not `/tmp`.** (v1.0 streamed to temp then "move": `/tmp` is tmpfs in compose → `rename()` across filesystems = `EXDEV` fail + big files fill RAM.)
- Upload: auth → write access to target → declared size ≤ `MAX_UPLOAD_BYTES` → row `uploading` → stream to tmp, count bytes (abort over limit), sha256 → sniff magic bytes vs ext vs declared (allowlist D-12) → rename into place → `ready` + ref in txn → return metadata. Fail → delete tmp, mark failed. Job sweeps stale `uploading` + `.tmp`.
- Download `GET /api/attachments/:id`: auth → ready, not deleted → requester can read ≥1 referencing source → stream with `Content-Type` from allowlist, `Content-Disposition` (RFC 5987 safe name; `attachment` for non-image), `nosniff`, `Cache-Control: private, no-store`. Images inline only for raster allowlist; SVG/HTML always download.
- Names: normalise, strip control chars/path bits. No user-controlled paths.
- GC: unreferenced past grace (D-12) → delete file + row.
- Uploads per user quota (e.g. 1 GB) + count cap, mirrors existing per-account caps.

## 13. Reminders + push

- In-process runner started after migrations; off in tests unless asked; **stopped on SIGTERM before DB close** (`[shutdown]`). Single replica = no leader election (SERVICE-HANDOFF says 1 replica).
- Tick every `REMINDER_POLL_INTERVAL_MS` (default 30 s): txn `UPDATE … SET status='processing', claimed_at=now WHERE status='scheduled' AND due_at<=now LIMIT 50 RETURNING …` → send outside txn → mark `sent`/`failed` (attempts+1, backoff, max 5). Stuck `processing` > 5 min → back to `scheduled`. Idempotent: one row = one send.
- Parser: pure shared fn (client preview, server truth). `1w|3d|2d|1d|2h` → (value,unit). `minute` unit reserved for D-15.
- Resolve: timed item → local date+time in owner tz → UTC − offset. Block → start_at − offset. All-day → D-13. Source reschedule → recalc in same txn. Source delete → `cancelled`; restore → recalc.
- Web Push: VAPID keys in env (never DB/git). Library `web-push` (maintained). 404/410 → revoke sub. Accepted by push service ≠ shown; UI says "sent".
- Service worker shows notification, click → open route (re-checks access on load). Payload = title + route only, no private body.

## 14. Access + sharing

- Policy fns per module: `assertCanRead/WritePage`, `…KeepNote`, `assertCanReadAttachment`, existing calendar filter. Throw → 404.
- Calendar grants unchanged (view-only, server-filtered, private = Busy). Never grant Keep/Pages.
- Page/note shares: explicit rows only. Rules regardless of D-01..D-04: private default · id guess = 404 · revoke works next request · search/graph filtered · file download checks source · view can't write · edit can't re-share/change owner · all server-side.
- Before D-01..D-04 closed: ship private-only; schema ready, no inheritance.
- Co-edit (M7): evaluate Yjs + Tiptap collab + SQLite-persisted docs; auth on every connection + update; compaction; reconnect merge; revoke kicks socket. Needs WebSocket through Cloudflare Tunnel (works, check timeout). ADR-008 first.

## 15. Ops contract changes (tell deploy chat via SERVICE-HANDOFF + release notes)

| Change | Why | Ops action |
|---|---|---|
| `uploads/` under `/app/data` | files | nothing (volume), but backups must include it |
| **backup.sh / restore.sh** | v1 backs up `app.db` only | add `tar` of `uploads/` (excl `.tmp`) with same timestamp; restore swaps both; restore drill checks every `ready` attachment has a file |
| Outbound HTTPS from app | Web Push (+ link previews if D-23 yes) | update "no outbound calls" line; allow egress 443 |
| New env | below | add to `deploy/.env.example`, validated at boot |
| `/healthz` | + `jobs:true/false`, reminder backlog count | uptime check unchanged (still `ok`) |
| CSP | push needs nothing; previews: proxy images through app (`/api/previews/:id/img`) so `img-src 'self'` stays | none |

Env adds (zod at boot, bad → `Bad env:` exit):
| Var | Default | Note |
|---|---|---|
| `UPLOAD_DIR` | `/app/data/uploads` | must be under volume |
| `MAX_UPLOAD_BYTES` | D-12 | server truth, UI reads it |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | none → push disabled | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:<owner>` | |
| `JOBS_ENABLED` | `true` | |
| `REMINDER_POLL_INTERVAL_MS` | `30000` | |
| `LINK_PREVIEWS` | `false` | D-23 |

Link preview fetch (if enabled): server-side only, http(s), resolve DNS then block private/loopback/link-local/CGNAT ranges (SSRF), 3 s timeout, 512 KB cap, no cookies, only `og:` title/site/image; image stored as attachment-like cache.

Backup = SQLite online backup + uploads tar + secrets kept separately. Restore = stop → db → uploads → secrets → start → migrate → `PRAGMA integrity_check` → file existence check → login + sample planner/Keep/Page → open.

## 16. Theme

- `isLight(nowUtc, tz, L, D)`: `t` = local minutes; `L<D` → `L<=t<D`; `L>D` → `t>=L || t<D`; `L==D` blocked by D-08. Uses user's saved times (v1.0 hard-coded 07/17 in the formula).
- SSR sets `<html data-theme>` from user; login uses `lt_theme` cookie. Auto: evaluate on load + on `visibilitychange` + timer to next boundary (nice-to-have, not relied on).

## 17. PWA + offline

- Phone layout = separate Svelte components under `lib/components/mobile/` (Today, BottomBar, AddSheet, ItemSheet), picked by CSS breakpoint 700 px + SSR hint; same API (`/api/calendar?from&to` for one day). No new endpoints for Today.

- SvelteKit `service-worker.ts` + manifest. Cache versioned static assets + shell only. **Never cache authed API responses** in Cache Storage.
- Offline Keep: IndexedDB store of chosen notes + op queue `{opId, resourceId, baseRevision, payload, createdAt, state}`. Online → send in order → ack removes → 409 kept for user (D-06) → 403/404 surfaced, local copy wiped per offline privacy rule. Logout wipes IndexedDB.
- Offline Pages = later.
- Push/PWA feature-detected; unsupported → explain, no dead "Enable" button.

## 18. API (new; existing ones unchanged)

| Area | Endpoints |
|---|---|
| Keep | `GET/POST /api/keep/notes` · `GET/PATCH/DELETE /api/keep/notes/:id` · `POST …/:id/{restore,archive,pin,duplicate}` · `DELETE …/:id/permanent` · `POST /api/keep/notes/reorder` · CRUD `/api/keep/labels`, `/api/keep/binders` · `PUT /api/keep/notes/:id/{labels,binders}` · checklist `POST/PATCH/DELETE /api/keep/notes/:id/items[/:itemId]` |
| Pages | `GET/POST /api/pages` · `GET/PATCH/DELETE /api/pages/:id` · `POST /api/pages/:id/{move,restore}` · `POST /api/pages/:id/blocks` · `PATCH/DELETE /api/pages/:id/blocks/:bid` · `POST /api/pages/:id/blocks/reorder` · `GET /api/graph` · `GET /api/pages/:id/graph` · `GET/PUT /api/page-shortcuts` |
| DB | `GET/POST /api/databases` · `GET/PATCH/DELETE /api/databases/:id` · props `GET/POST /api/databases/:id/properties`, `PATCH/DELETE /api/database-properties/:id` · records `GET/POST /api/databases/:id/records`, `PATCH/DELETE /api/database-records/:id`, `PATCH …/:id/values` · views CRUD `/api/databases/:id/views` |
| Shared | `POST /api/attachments` (multipart stream) · `GET/DELETE /api/attachments/:id` · `POST /api/reminders`, `PATCH/DELETE /api/reminders/:id` · `GET/POST /api/undo` · `POST /api/push/subscribe`, `DELETE /api/push/subscribe/:id` · `GET /api/search?q&kind` · `PATCH /api/me/prefs` (+ theme_mode, starts) |

Pages/records PATCH carry `expectedRevision` → 409 `{error:{code:'CONFLICT',message,revision}}` (no inaccessible content). Lists paginated with server max. Origin check + rate limits as existing (uploads: per-user rate limit).

## 19. Jobs

| Job | When | Safety |
|---|---|---|
| Due reminders | 30 s | atomic claim, idempotent |
| Stuck processing | 5 min | requeue/fail |
| Undo expiry | hourly | expired only |
| Planner trash | existing 30 d | unchanged |
| Keep/Page trash | after D-17/D-18 | respects refs |
| Stale uploads + `.tmp` | hourly | > 1 h old |
| Attachment GC | daily | unreferenced past grace |
| Push sub cleanup | on 404/410 + daily | revoke |
| Search rebuild | manual | one txn per owner |

Runner errors logged `[job] …`, health shows state; app keeps serving.

## 20. Security checklist (adds to TECHNICAL §11)

- [ ] Every new route authed; every op checks actor, ownership/grant, permission level, parent-child consistency (block∈page, prop/record∈DB), lifecycle state.
- [ ] Origin check + `checkOrigin` on uploads/mutations.
- [ ] zod limits: string length, array length, nesting depth, file size, graph size, filter count.
- [ ] Unknown block type / schema version rejected.
- [ ] XSS: known schemas only, DOMPurify on imports, safe URLs, no inline SVG/HTML files.
- [ ] Files: private dir, random keys, stream limit, magic-byte sniff, access-checked download, no traversal.
- [ ] SSRF guard on any server fetch.
- [ ] Secrets env only (APP_SECRET, VAPID private, TUNNEL_TOKEN); push keys never logged.
- [ ] Audit `created_by/updated_by` on shared stuff; no full-content audit log.

## 21. Tests

- Unit: theme rule (incl. wrap), reminder parse + resolve, block schemas + migrate, prop validation, position keys + rebalance, page cycle check, search filtering, graph projection (no inaccessible), file name/MIME, undo inverse + conflict, policy fns.
- Integration (temp SQLite + real migrations): repo scoping, page/block CRUD, Keep relations, DB constraints, attachment ref lifecycle, reminder claim/retry, undo txns, share enforcement, search sync, graph from real data.
- E2E: FEATURES §17 list + planner regression.
- Security matrix per resource: anon · other user · owner · view · edit · revoked · guessed id · guessed attachment id · stale URL. Assert bodies contain no hidden title/content/path, not just status.
- Migration: copy of live-like DB (anonymised) → all migrations → users, sessions, calendars, items, blocks, grants, theme preserved; dates/instants byte-identical; backup/restore works; empty DB works.

## 22. Spikes + ADRs (M0)

Spikes: **S-1** Tiptap + Svelte 5 · **S-2** graph renderer · **S-3** upload streaming under read-only rootfs + EXDEV-safe rename · **S-4** Web Push from homelab through tunnel to Chrome/Edge/Android (iOS PWA needs install). Each ends with an ADR.
ADRs in `docs/adr/`: 001 monolith + SQLite · 002 editor · 003 block storage · 004 DB record model · 005 attachments · 006 scheduler · 007 graph renderer · 008 co-edit (M7) · 009 offline sync (M8). Changed decision = new ADR supersedes old.

## 23. Done = (per feature)

Meets PRD + FEATURES · migrations committed · validation + access checks · layers respected · error/empty states · unit + integration + e2e · security matrix · planner regressions green · docs + `.env.example` + SERVICE-HANDOFF updated · backup/restore covers new data · no open D-xx built as if decided.

## FIX LOG (v1.0 → rev 1.1)

1. New `{data,meta}` envelope vs existing `{error}` / plain-object API → keep existing.
2. New `content_search` beside dormant `search_fts` → replace, one FTS table.
3. `lib/server/access/` dir vs existing `access.ts` file → move it in.
4. `user_preferences` table vs existing pattern (`users.theme`, `plan_mode`) → columns on users; migrate `theme` → `theme_mode`.
5. Theme formula hard-coded 07:00/17:00 → uses saved starts, handles wrap.
6. Keep notes had no order column though reorder is CORE → `position_key` everywhere.
7. `page_shortcuts UNIQUE(sort_order)` breaks swaps → PUT replaces set in txn.
8. `page_links` UNIQUE with nullable `source_block_id` → dups in SQLite → NOT NULL.
9. `attachment_refs … ON DELETE RESTRICT` blocks user-delete cascade → CASCADE + service guard.
10. Upload temp in `/tmp` (tmpfs) then move → EXDEV + RAM risk → temp under uploads volume.
11. Backup only covered `app.db` → backup/restore must include uploads (ops change §15).
12. Push + link previews = outbound calls, contradict SERVICE-HANDOFF; previews = SSRF risk + CSP `img-src 'self'` blocks remote images → §15 (D-23, proxy, guard).
13. Scheduler not stopped on SIGTERM → stop before DB close.
14. Reminder dup rule undefined → UNIQUE(source, due_at).
15. Undo journal kept after logout → purged on expiry + sign-out-everywhere; expiry 12 h.
16. Phase 0–8 renumbered to PRD M0–M8; T-01..T-15 merged into PRD §12 D-list.
18. Page archive: `archived_batch`, `last_opened_at`, dismissals table; graph keeps archived nodes; graph scale target 5k nodes.
17. Baseline said "existing Docker image"; now: GHCR release image, live v1.1.0, read-only rootfs, one replica.
