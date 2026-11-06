# Life Tracker — TECHNICAL

Caveman doc. How build. Read REQUIREMENTS.md first (FR ids referenced here). Rev 2 (after 10-agent review, see REVIEW.md).

## 1. Stack (locked)

| Part | Pick | Why |
|---|---|---|
| Lang | TypeScript strict | one lang front + back |
| Framework | SvelteKit 2 + Svelte 5 (runes) | SSR + API routes + form actions, small bundle |
| Runtime | Node 22 LTS | better-sqlite3 + argon2 prebuilt for win-x64 + linux-x64 glibc; `--env-file` built in |
| Adapter | `@sveltejs/adapter-node` | plain `node build` in Docker |
| DB | SQLite 3 via `better-sqlite3` | one file, fast, sync API |
| ORM | `drizzle-orm` + `drizzle-kit` | typed schema, SQL migrations |
| Validation | `zod` | API input + seed JSON |
| Password | `@node-rs/argon2` (argon2id) | prebuilt, no node-gyp |
| Calendar month/week | FullCalendar v6 MIT plugins only: `@fullcalendar/core daygrid timegrid interaction` | drag, resize, 15-min snap. No premium plugins. |
| Day planner | own `DayPlanner.svelte` | lanes "Me \| Neina" (FullCalendar lanes = premium), exact wireframe look |
| Dates | `date-fns` + `@date-fns/tz` (TZDate) | tz math Asia/Kuala_Lumpur |
| Markdown notes | `marked` + `isomorphic-dompurify` | render notes safe |
| Tests | Vitest (unit) + Playwright (e2e) | |
| Lint | eslint + prettier + svelte-check | |

No Tailwind. Plain CSS + tokens (sec 9).

## 2. Folder layout

```
life-tracker/                repo root = Docker build context
  .env.example               dev template      .env.prod.example  prod template (NOT made yet: copy block in DEPLOYMENT §0)
  .gitignore .dockerignore   (root, see DEPLOYMENT)
  docker-compose.yml
  docs/                      REQUIREMENTS / TECHNICAL / DEPLOYMENT / REVIEW
  data/
    notion-raw/              Notion export (psv + json). Source for transform
    seed/                    transform output. Input for import. _report.json = counts
    app.db                   runtime DB dev (gitignored)
  scripts/
    transform_notion.py      raw -> seed (python, stdlib)
  wireframes/                .dc.html copies of design canvas
  app/                       SvelteKit project (create in Phase 1)
    Dockerfile
    src/
      app.d.ts               Locals { user, session }
      hooks.server.ts        init (migrate), session load, guard, origin check, headers
      service-worker.ts      P3 PWA
      lib/server/
        db.ts                better-sqlite3 + drizzle + pragmas
        schema.ts            drizzle tables (sec 4)
        env.ts               zod-parsed env (fail fast on boot)
        crypto.ts            randomCode, hmac(APP_SECRET), sha256, base32
        auth.ts              sessions, cookies, argon2, rate limits
        access.ts            listAccess, assertCanWrite, filterItem, filterBlock
        sharekeys.ts invites.ts
        quickadd.ts          parser (pure, shared with client preview)
        seed.ts              importSeed(dir, ownerUsername)
        search.ts ics.ts
        repo/*.ts            one per table; ALL owner/access scoping here
        common-passwords.txt top 1000 (FR-A8)
      lib/time.ts            ONLY place doing date/tz math (shared)
      lib/types.ts lib/colors.ts
      lib/components/        MonthCalendar WeekCalendar DayPlanner StatusSquare ItemChip OverlapToggle QuickAdd UndoToast
      routes/                (sec 8)
    static/manifest.webmanifest  P3
    drizzle/                 generated SQL migrations
    scripts/seed.ts          dev CLI -> lib/server/seed.ts
    scripts/reset-password.mjs  plain JS, runs in prod container (sec 5)
    tests/unit/ tests/e2e/
```

## 3. DB + storage rules

- Path from env `DATABASE_PATH` (dev `../data/app.db`, prod `/app/data/app.db`). Create parent dir on boot if missing.
- Pragmas on open: `journal_mode=WAL; foreign_keys=ON; busy_timeout=5000; synchronous=NORMAL`.
- Migrations: `drizzle-kit generate` in dev. Server runs `migrate()` in `hooks.server.ts` `init` before first request. Forward only.
- Ids: text `prefix_` + random. New ids = prefix + 16 chars base32 (80 bits). Imported ids from seed kept (`itm_<12hex>`, owner `usr_jeremy` remapped on import).
- **Time rules (most bug-prone, obey):**
  - Instants (`*_at`, blocks start/end): UTC ISO `YYYY-MM-DDTHH:MM:SSZ`. Always Z. `CHECK (x LIKE '%Z')`.
  - Items are date-centric: `date` = local calendar date `YYYY-MM-DD` in calendar owner tz; `time` = local `HH:MM` or NULL (= all-day); `end_date` = local, **inclusive**, NULL = single day. No UTC for items. Drag item to other day = change `date` only, `time` kept (no tz shift bug).
  - FullCalendar all-day end is exclusive → add 1 day when mapping out, subtract when mapping back. Only in `lib/time.ts`.
  - "Today", "due today", week, ISO week: computed in user tz via `TZDate`. Never `new Date('YYYY-MM-DD')`.
  - ISO weeks: `getISOWeek` + `getISOWeekYear` (2026 has W53; 2027-01-02 = 2026-W53).
- Booleans 0/1 (`mode:'boolean'`). Arrays/objects = JSON text, `CHECK (json_valid(col))`.
- Soft delete ONLY: items, blocks, places (`deleted_at`). Everything else hard delete with confirm. Soft-deleting an item soft-deletes its steps (`parent_id`) + linked blocks in same transaction; restore restores same set (store `deleted_batch` id). Trash purge: rows with `deleted_at` > 30 d hard-deleted on boot + daily.

## 4. Schema (SQL truth; mirror in drizzle)

```sql
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- 'setup_done' = '1'

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,                  -- argon2id PHC. NULL = cannot log in (treated as unknown user)
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  color TEXT NOT NULL DEFAULT '#1C1917',  -- avatar/badge. Must not equal a Type ink (sec 9)
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  overlap_on INTEGER NOT NULL DEFAULT 1, -- FR-S10 default ON
  ics_token_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                 -- sha256hex(token)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remember INTEGER NOT NULL,
  expires_at TEXT NOT NULL, absolute_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  user_agent TEXT, ip TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE rate_limits (             -- login, redeem, signup, setup
  key TEXT PRIMARY KEY,                -- e.g. 'login:u:jeremy|1.2.3.4', 'login:ip:1.2.3.4', 'redeem:usr_x', 'signup:ip:..'
  count INTEGER NOT NULL, window_start TEXT NOT NULL, locked_until TEXT
);
CREATE TABLE invites (
  id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE,  -- HMAC-SHA256(APP_SECRET, normalised code)
  label TEXT,                          -- admin note e.g. 'for Neina'. never code-derived
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL, used_by TEXT REFERENCES users(id) ON DELETE SET NULL, used_at TEXT,
  revoked_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE calendars (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX calendars_one_default ON calendars(owner_id) WHERE is_default = 1;
CREATE TABLE courses (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases)),  -- quick-add tags ['sp','sysprog']
  active INTEGER NOT NULL DEFAULT 1, source_ref TEXT,
  UNIQUE(owner_id, code)
);
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  type TEXT CHECK (type IN ('Work','Exam','Event','Hobby','Dating')),   -- NULL = None
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  date TEXT,                           -- local YYYY-MM-DD; NULL = Unscheduled
  time TEXT CHECK (time IS NULL OR time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_date TEXT CHECK (end_date IS NULL OR end_date >= date),           -- inclusive
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  notes TEXT,
  private INTEGER NOT NULL DEFAULT 0,  -- FR-S17: always Busy to grantees
  rrule TEXT, exdates TEXT CHECK (exdates IS NULL OR json_valid(exdates)),  -- P3
  started_at TEXT, completed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TEXT, deleted_batch TEXT,
  source TEXT CHECK (source IS NULL OR source = 'notion')
);
CREATE INDEX items_cal_range ON items(calendar_id, date, COALESCE(end_date, date));
CREATE INDEX items_parent ON items(parent_id);
CREATE INDEX items_course ON items(course_id);
CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  type TEXT CHECK (type IN ('Work','Exam','Event','Hobby','Dating')),
  start_at TEXT NOT NULL CHECK (start_at LIKE '%Z'),
  end_at TEXT NOT NULL CHECK (end_at LIKE '%Z'),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  rrule TEXT, exdates TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TEXT, deleted_batch TEXT,
  CHECK (end_at > start_at)            -- may cross midnight (Sleep 23:00-06:00 OK)
);
CREATE INDEX blocks_cal_start ON blocks(calendar_id, start_at);
CREATE INDEX blocks_item ON blocks(item_id);

CREATE TABLE share_keys (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  key_hash TEXT NOT NULL UNIQUE,       -- HMAC-SHA256(APP_SECRET, normalised key). No hint column.
  permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
  visible_types TEXT NOT NULL CHECK (json_valid(visible_types)),  -- subset of Work Exam Event Hobby Dating None blocks
  hidden_as TEXT NOT NULL CHECK (hidden_as IN ('busy','none')),
  expires_at TEXT NOT NULL,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL, used_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE grants (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  grantee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
  visible_types TEXT NOT NULL CHECK (json_valid(visible_types)),
  hidden_as TEXT NOT NULL CHECK (hidden_as IN ('busy','none')),
  in_overlap INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, revoked_at TEXT,
  UNIQUE(calendar_id, grantee_id)
);
CREATE INDEX grants_grantee ON grants(grantee_id);

-- private modules: owner only, never shared, never in grantee responses
CREATE TABLE goals (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]'), text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX goals_owner ON goals(owner_id, period);
CREATE TABLE workout_split (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), exercise TEXT NOT NULL, sort INTEGER NOT NULL,
  current_kg REAL, current_effort TEXT CHECK (current_effort IN ('light','moderate','heavy')),
  legacy_weeks TEXT CHECK (legacy_weeks IS NULL OR json_valid(legacy_weeks)));  -- Notion week1..4 = "Before app"
CREATE INDEX wsplit_owner ON workout_split(owner_id, weekday);
CREATE TABLE workout_logs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL, exercise TEXT NOT NULL, weight_kg REAL,
  effort TEXT CHECK (effort IN ('light','moderate','heavy')), sets INTEGER, reps INTEGER, note TEXT,
  created_at TEXT NOT NULL);
CREATE INDEX wlogs_owner_date ON workout_logs(owner_id, date);
CREATE TABLE places (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, city TEXT NOT NULL,
  areas TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(areas)), cuisines TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cuisines)),
  open_when TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(open_when)),   -- [] = hours unknown
  closed_on TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(closed_on)),   -- [] = open every day
  halal INTEGER NOT NULL DEFAULT 0, visited INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5), notes TEXT, last_visited TEXT,
  deleted_at TEXT, deleted_batch TEXT);
CREATE INDEX places_owner ON places(owner_id, city);
CREATE TABLE lists (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX lists_owner ON lists(owner_id);
CREATE TABLE list_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, note TEXT, link TEXT,
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX list_items_list ON list_items(list_id, sort);
CREATE TABLE people (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases)));
CREATE INDEX people_owner ON people(owner_id);
CREATE TABLE person_facts (id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('likes','info','hates','wants','bucket_list','misc')),
  text TEXT NOT NULL, detail TEXT, item_id TEXT REFERENCES items(id) ON DELETE SET NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX facts_person ON person_facts(person_id, category);
CREATE TABLE ideas (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea','filmed','edited','posted')),
  text TEXT NOT NULL, created_at TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX ideas_owner ON ideas(owner_id, stage, sort);
CREATE TABLE step_templates (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- P3
  name TEXT NOT NULL, steps TEXT NOT NULL CHECK (json_valid(steps)));  -- [{title, days_before}]

CREATE VIRTUAL TABLE search_fts USING fts5(kind UNINDEXED, ref_id UNINDEXED, owner_id UNINDEXED, text);
```

Rules:
- Every private-module query scoped `owner_id = locals.user.id` inside `repo/*`. Routes never build SQL. Never accept owner_id/calendar_id/created_by/updated_by from client.
- `search_fts` sync done in repo helpers (not triggers): create/update → upsert row(s) (`kind`, `ref_id`, owner resolved via calendar for items); soft-delete/hard-delete → delete row. Rebuild all on import. Owner-only search; shared calendars not searched.
- Seed import converts: JSON bool → 0/1, arrays/objects → JSON text, missing timestamps → schema defaults (never stamp now() on existing rows), remaps `usr_jeremy`/`cal_jeremy_main` to real owner.

## 5. Auth (FR-A*)

Env: `APP_SECRET` (32+ bytes random, required in all envs; HMAC pepper for invites, share keys, ics token, busy ids). Changing it invalidates unused keys/invites only. Full env list: DEPLOYMENT §0.

Cookie:
```
secure  = ORIGIN starts with 'https://'          // NOT NODE_ENV (Stage B is http LAN)
name    = secure ? '__Host-lt_session' : 'lt_session'
token   = base32(randomBytes(20))                // 160 bits
sid     = sha256hex(token) -> sessions.id
attrs   HttpOnly; SameSite=Lax; Path=/; Secure if secure
remember=1 -> Max-Age 30d, expires_at now+30d, absolute_expires_at created+90d
remember=0 -> no Max-Age (browser session), expires_at now+12h, absolute = created+7d
```
Every request (hooks):
1. cookie → sid → join user (password_hash NOT NULL). Missing or `expires_at<now` or `absolute_expires_at<now` → delete row, clear cookie, user=null.
2. Sliding, write max once per 5 min (with last_seen_at): remember=1 and expires_at−now < 15 d → now+30 d + reset cookie Max-Age; remember=0 → now+12 h. Never past absolute.
3. FR-A3 truth = server 12 h idle. Browser "restore session" may keep cookie; server still kills it.
4. Guard (FR-A11): user=null and path not public (`/login /signup /setup /healthz /cal/*.ics`, `/_app/*`, static) → page: 303 `/login?next=<path+search>`; `/api/*`: 401 JSON.

Login (POST /login form action):
1. normalise username (trim, lower). ip = `event.getClientAddress()`.
2. Rate limits (table `rate_limits`, 15-min window): `login:u:<user>|<ip>` 5 fails → lock 15 min; `login:ip:<ip>` 30 fails → lock 15 min (stops spray across usernames); `login:u:<user>` (any ip) >20 fails/15 min → add 2 s delay per attempt (no hard lock = attacker can't lock admin out).
3. Unknown user or NULL hash → verify against fixed dummy hash (timing). Same message always: "Wrong username or password. N tries left" (N from the user|ip counter). Locked → 429 "Too many tries. Try again in M min".
4. OK → clear `login:u:<user>|<ip>`, delete old session row if cookie present (fixation), new session (remember from checkbox), redirect `next` only if matches `^/(?![/\\])` and `new URL(next, ORIGIN).origin === ORIGIN`, else `/`.
5. Argon2id `memoryCost 19456, timeCost 2, parallelism 1`. `needsRehash` → rehash on success.

/setup (first run, FR-A6): `app_meta.setup_done` set → 404. Else POST with token: constant-time compare vs `SETUP_TOKEN` (empty/unset env = setup disabled). One `BEGIN IMMEDIATE` transaction: re-check `setup_done` absent AND users count 0 → insert admin + default calendar → set `setup_done=1`. Rate limit `setup:ip` 5/15 min. /setup does NOT import seed (separate step, FR-IM1).

Invites (FR-A7): admin POST /api/invites → code `INV-XXXX-XXXX-XXXX` (60 bits, same generator as share keys), shown once, `code_hash`=HMAC, expiry ≤ 7 d (zod enum 1d/3d/7d), optional label. Signup: rate limit `signup:ip` 10/15 min; one transaction: `UPDATE invites SET used_by=?,used_at=? WHERE code_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?` → changes must be 1 → create member + default calendar. Password rule FR-A8: zod length 10–128 + not in common list.

Logout: POST only (form). Delete row, clear cookie. "Sign out everywhere": delete all user sessions except current. Password change (FR-A10): verify current → new hash → delete all other sessions → rotate current (new token).

Recovery (single admin locked out): `docker compose exec app node scripts/reset-password.mjs <username>` → prompts new password (stdin, not argv) → sets hash → deletes that user's sessions → clears rate_limits for user. Dev (from app/): `npm run reset-password -- <username>` (= `node --env-file=.env scripts/reset-password.mjs`). Admin can also reset member password in Settings > Users.

CSRF: SvelteKit `checkOrigin` covers form actions. hooks: any non-GET/HEAD → `Origin` header must equal `ORIGIN` env; missing Origin → 403. SameSite=Lax second wall.
Proxy: `ADDRESS_HEADER=CF-Connecting-IP` only in Stage C AND app port not published. hooks: if ADDRESS_HEADER set and header missing → 400 (fail closed, request did not come via tunnel).

Headers (hooks): CSP via `kit.csp` mode auto: `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`. Plus `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

## 6. API

Page data via `+page.server.ts` load. Mutations via JSON `+server.ts` or form actions. All bodies zod with `.strict()` (unknown keys rejected — stops client setting owner/calendar/audit fields). Errors `{error:{code,message}}`. 401 no session, 403 bad origin, 404 not found OR not yours (never reveal), 409 conflict, 429 rate limit.

| Method | Path | Does | FR |
|---|---|---|---|
| POST | /login /signup /setup /logout (form actions) | auth | A1-A7 |
| GET | /api/calendar?from&to | my items+blocks + overlap calendars (if overlap_on, grant active, in_overlap) through filters | H2,S10 |
| POST | /api/items | create in MY default calendar only | Q,I |
| PATCH | /api/items/:id | fields per sec 7 write rules | H6,I1 |
| POST | /api/items/:id/cycle | todo→doing→done→todo, sets/clears started_at, completed_at | H3,H4 |
| DELETE | /api/items/:id | soft delete + steps + blocks (owner only) | I5 |
| GET | /api/trash · POST /api/trash/:batch/restore | list / restore | I5 |
| GET | /api/unscheduled | my items date NULL | H16 |
| POST/PATCH/DELETE | /api/blocks[/:id] · POST /api/blocks/:id/cycle | planner | H10-H13 |
| POST | /api/quickadd | `{text}` parse+create | Q |
| GET/POST/PATCH/DELETE | /api/courses[/:id] | course + aliases | Q3 |
| PATCH | /api/me/prefs | `{overlap_on}` | S10 |
| POST | /api/me/password | change | A10 |
| GET/DELETE | /api/sessions[/:id] · POST /api/sessions/revoke-others | devices | A4,A5 |
| GET/POST/DELETE | /api/invites[/:id] (admin) | invites | A7 |
| GET/POST | /api/users (admin) · POST /api/users/:id/reset-password | members | A10 |
| POST | /api/share-keys | make key, return plain ONCE | S2 |
| GET/DELETE | /api/share-keys[/:id] | unused keys (created, expires, settings), revoke | S8 |
| POST | /api/share-keys/redeem | `{key}` → grant | S4 |
| GET | /api/grants | given + received | S8,S9 |
| PATCH | /api/grants/:id | owner: permission/types/hidden_as; grantee: in_overlap | S8,S9 |
| DELETE | /api/grants/:id | sets revoked_at (owner revoke or grantee leave) | S8,S9 |
| CRUD | /api/places /api/lists /api/lists/:id/items /api/people /api/people/:id/facts /api/ideas /api/workouts/split /api/workouts/logs /api/goals | owner only | P,L,PE,ID,W,G |
| PATCH | /api/lists/reorder · /api/lists/:id/items/reorder · /api/ideas/reorder `{ids[], stage?}` | sort + stage move | L5,ID1 |
| POST | /api/places/:id/visited · GET /api/places/random?filters | | P5,P6 |
| POST | /api/list-items/:id/plan · /api/facts/:id/plan `{date}` | Dating item; from facts default private=1 | L4,PE3 |
| POST | /api/workouts/log-session `{date, logs[]}` | insert logs + mark today's block labelled 'Workout' done | W5 |
| GET | /api/search?q= | FTS grouped | SR1 |
| GET | /api/import/report · POST /api/import (admin) `{owner}` | read SEED_DIR/_report.json, run import | IM1-3 |
| POST | /api/me/ics-token | rotate, return URL once | F1 |
| GET | /cal/:token.ics | own items only, private items included (it's yours) | F1 |
| GET | /healthz | `{ok, db}`, no auth, no setup redirect | |

Places POST/PATCH returns `{place, warnings:['possible duplicate of <name>']}` (FR-P7: same city, name lower, `kafe`→`cafe`, strip punctuation). Ideas POST/PATCH warns when channel=chicenwangs2 and text > 70 chars (FR-ID3, warning not error).

## 7. Access control (P2, most important code)

```ts
type Access = { calendarId; ownerId; mine: boolean; permission: 'owner'|'edit'|'view';
                visible: Set<'Work'|'Exam'|'Event'|'Hobby'|'Dating'|'None'|'blocks'>; hiddenAs: 'busy'|'none'; color };
listAccess(me, {overlapOnly}) // own default + grants WHERE grantee=me AND revoked_at IS NULL (AND in_overlap=1 if overlapOnly)
assertCanWrite(me, calendarId) // owner or edit grant, else throw 404
```
Read filter (server only; client never sees hidden data):
- `typeKey = item.type ?? 'None'`. Item **visible** to grantee iff `visible.has(typeKey) && !item.private`.
- visible → `{id, title, type, status, date, time, end_date, theirs:true, ownerColor}`. **No notes, no course, no parent, no steps, no created_by** to grantees (ever).
- hidden + busy → `{id: busyId, busy:true, title:'Busy', type:null, date, time, end_date}`. `busyId = 'busy_' + hmac(APP_SECRET, item.id + me).slice(0,16)` (stable, unguessable).
- hidden + none → dropped.
- Block visible iff `visible.has('blocks')` AND (no item_id OR linked item visible). Visible block → `{id,label,type,start_at,end_at,status}` (item_id only if item visible). Else busy/drop same as items, label/type/item_id stripped.
- Item detail page for theirs: read-only card from the filtered object. No "Also in course", no steps (FR-I4 own only).
- Unit test: for each hidden case, `JSON.stringify(response)` must not contain hidden title, notes, item_id.

Write rules (grantee with `edit`):
- Allowed on their visible items/blocks only: cycle status, change date/time/end_date, move/resize blocks, rename title.
- Not allowed: create in owner calendar, delete, change type, course_id, parent_id, private, notes, calendar_id. (Server ignores nothing silently: zod strict schema for grantee PATCH = allowed fields only.)
- Busy rows never writable. Every write sets `updated_by = me`.
- Owner writes: anything on own rows; referenced ids (course_id, parent_id, item_id) must belong to same owner/calendar (check in repo).

Share keys:
```
alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'   // Crockford, no I L O U
gen: 12 chars via crypto.randomInt -> 'LT-XXXX-XXXX-XXXX' (60 bits)
normalise(input): upper -> trim -> strip leading 'LT' + separators -> remove spaces/dashes -> O->0, I/L->1 -> must be exactly 12 chars of alphabet else invalid
key_hash = HMAC-SHA256(APP_SECRET, normalised)
expiry: zod enum ['1h','24h','7d'] server side
redeem: rate limit redeem:<me> 5 fails/15 min. BEGIN IMMEDIATE:
  UPDATE share_keys SET used_by=me, used_at=now WHERE key_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now AND created_by<>me  -> changes must be 1 else generic error
  INSERT INTO grants(...) VALUES(...) ON CONFLICT(calendar_id, grantee_id) DO UPDATE SET
    permission=excluded.permission, visible_types=excluded.visible_types, hidden_as=excluded.hidden_as,
    in_overlap=1, revoked_at=NULL
COMMIT
purge: unused keys past expiry deleted on boot + hourly.
```
Revoke = soft (`revoked_at`). Re-redeem after revoke resurrects with new settings (tested).
User delete (admin, rare): cascades their calendars/items; audit FKs SET NULL.

## 8. Front end

| Route | Wireframe | Phase |
|---|---|---|
| /login (tabs link to /signup) | Login.dc.html | P1 |
| /signup (invite code) | Login.dc.html "Create account" tab | P2 |
| /setup | (simple form: token, username, display name, password) | P1 |
| / | Desktop.dc.html | P1 (overlap P2) |
| /week | DesktopWeek.dc.html | P1 |
| /item/[id] | DesktopItem.dc.html | P1 |
| /settings/account, /settings/sessions, /settings/courses, /settings/goals, /settings/import | (plain forms; import needed for Stage B) | P1 |
| /settings/sharing, /settings/invites, /settings/users, /trash | DesktopSharing.dc.html + plain | P2 |
| /places /lists /people/[id] /ideas /workouts | Desktop*.dc.html | P2 |
| mobile | Main, Calendar, QuickAdd, ItemEditor, Places, More, Lists, People, Ideas, Workouts | P3 |

P1 header shows only built pages (Home, Week). Nav items appear as modules ship.

Home layout (FR-H1): CSS grid `2fr 1fr` (calendar | planner), gap 16 px. Under 1000 px → one column, planner under calendar. Month/Week toggle (FR-H8) = route switch `/` ↔ `/week`.

WeekCalendar (FullCalendar `timeGridWeek`, FR-H8): same feed + mapping as MonthCalendar, `slotDuration`/`snapDuration` 00:15, all-day row on, `firstDay:1`. Right 1/3 = Due soon + Unscheduled panels.

Derived panels (no extra API): Due today (H12) = `/api/calendar` items date=today, status≠done. Due soon (H8) = items date in [today, today+7], status≠done, no block with that item_id. People side panel (PE4) = page load: own items type=Dating, status=done, date desc + first 5 of list "Date ideas". Workouts progress (W4) = logs grouped by ISO week (getISOWeekYear+getISOWeek), last 4 incl. current; seed week1–4 shown as "Before app".
UI-only (follow wireframe): L3 done collapse, ID1 keyboard ←/→ move (calls /api/ideas/reorder), ID2 channel filter (client), H14 goals under planner (PATCH /api/goals/:id), M2 (P3).

MonthCalendar (FullCalendar): `dayGridMonth`, `firstDay:1`, no FullCalendar timeZone tricks — feed it local strings from `lib/time.ts` (`date`, `date+'T'+time`), `allDay` = time NULL, end = end_date+1 day. `dayMaxEvents:4`. `eventContent` → DOM node with StatusSquare (own) or initial badge (theirs) + title. `editable` per event (own or edit grant). Source = `/api/calendar`. Refetch on overlap toggle, window focus, every 60 s.
- `eventDrop` → PATCH `{date}` (time kept); error → `info.revert()`; success → UndoToast 5 s (FR-H6) calling PATCH back.
- Drag to planner: `eventDragStop` with `jsEvent` inside planner rect → y → time → POST block `{item_id, start_at, end_at=+60m}`.

DayPlanner (custom):
- Grid 00:00–24:00, hourHeight 48 px, auto-scroll to 07:00, visible 07:00–23:00 in default height. Header: ‹ prev day · date · next day › · "Today" (FR-H9).
- Blocks shown on a day = overlap with [day 00:00, next 00:00) local. Crossing midnight → clipped piece on each day, edge marked.
- Pointer modes: create (empty), move (body), resize top/bottom (6 px handles). Snap: `round(min/15)*15`; if end ≤ start after snap → end = start+15. Optimistic, PATCH on pointerup, revert on error.
- HTML5 drop `application/x-lt-item` (due chips, unscheduled list) → block 60 min.
- Colour precedence (FR-H11): linked item type → block.type → None grey.
- Lanes: overlap OFF → 1 lane. ON → lane per calendar (me first), max 3 lanes; more → extra calendars packed into 3rd lane side-by-side. Inside a lane overlapping blocks share width (column packing).
- Both free (FR-S14, P3): for 08:00–22:00, union all lanes' busy intervals, gaps ≥ 60 min (edge gaps count) → green band.
- Now line every 60 s. Keyboard: focus block, arrows move 15 min, shift+arrows resize.

StatusSquare: `<button>` 16 px chips / 20 px blocks. todo = empty border; doing = ▶ inside; done = filled ink + ✓. aria-label "Not started. Click to start" etc. Space/Enter.

QuickAdd: keys (FR-Q1) `N` focuses (ignored while typing in a field), Enter saves, Esc clears. Parser `lib/server/quickadd.ts` (pure, imported by client for preview line FR-Q2; server re-parses = truth). Rules:
1. Tokenise on whitespace. Tokens matched whole only (case-insensitive). `#x` / `!x` only if whole token AND known (course alias / type word); unknown stays title text.
2. Types: `!work !exam !event !hobby !date !dating`.
3. Date tokens: `today`, `tmr`/`tomorrow`, weekday `mon..sun` or full name, `D MON` / `MON D` (month names `jan..dec` + full; bare `may` only when next to a day number), `D/M` (always day/month), `YYYY-MM-DD`. Only the LAST date token counts; earlier ones stay in title.
4. Time: `2pm`, `2:30pm`, `14:00`, `14.30` (hh 0–23 two-digit mm only; `v1.30` not time because attached to letters).
5. Rollover: weekday → next occurrence incl. today, but if today AND a time given that already passed → +7 d. `D MON` / `D/M` → this year, if before today → next year. No date token → today (if time given and passed → still today; show warning in preview).
6. Default type: `#course` present → Work, else Event. Title = remaining tokens joined, trimmed; empty → reject.
7. P3: `for 90m|1h|1h30` → also block; `every mon[,wed]` → rrule.
Test table ≥ 30 cases incl. "Sun Tzu reading tmr", "lab 5 fri", "dinner #spot", "clo3d v1.30 fri", "5 jan" on 2026-12-01.

Places open-now (FR-P4), in user tz: Morning 06:00–12:00; All Day 06:00–24:00; Night 17:00–02:00 next day. A Night window after midnight belongs to the PREVIOUS day (closed_on checked on that day). `open_when=[]` → "hours unknown", excluded from Open now filter, shown with grey tag. `closed_on=[]` → open daily.

## 9. Look (tokens from wireframe)

```
ground #F5F5F4  card #FFFFFF  border #D6D3D1  rule #E7E5E4  ink #1C1917  quiet #57534E
input border #78716C (3:1+ on white)   focus ring 2px #1C1917 offset 2
font Inter 400/500/600/700 (self-host woff2 in P2), radius card 14, chip 5-6, button 8-10
Type   bg        ink
Work   #DBEAFE   #1E3A8A
Exam   #FEE2E2   #7F1D1D
Event  #DCFCE7   #14532D
Hobby  #FEF3C7   #713F12
Dating #FCE7F3   #831843
None   #E7E5E4   #292524
Busy   #E7E5E4   #44403C (stripes)
theirs: repeating-linear-gradient(135deg, bg 0 5px, #fff 5px 8px) + 1px dashed ink + initial badge in user.color
user.color palette (never a Type ink): #1C1917 (Jeremy), #0F766E (Neina, teal), #6D28D9, #B45309
done: line-through + filled square. NO opacity (contrast). Planner done block: bg stays, text ink.
```
Dark mode: P3.

## 10. Data import

Pipeline: Notion → `data/notion-raw/` (done 2026-11-06) → `python scripts/transform_notion.py` → `data/seed/*.json` → import (dev CLI `npm run db:seed -- --owner jeremy`; prod Settings > Import, owner dropdown).

Seed facts (`_report.json`): items 391 (Work 232, Exam 43, Event 78, Hobby 25, Dating 13; done 375, doing 5, todo 11), blocks 4 (6 Nov planner, UTC), courses 5, goals 5, workout_split 11, places 130 (Kuching 119, Johor 11), lists 5, list_items 81 (Watchlist 6, Date ideas 14, Games 33, Soundtrack 26, rules 2), people 1, person_facts 24, ideas 63. 412 Notion rows = 391 items + 6 Watchlist + 14 Date ideas + 1 dropped template. Ideas 64 raw rows → 63 (1 empty dropped). `_report.json` `source_rows.dropped` is per source.

Mapping (applied by script):
- Status: Not Started→todo, In Progress→doing, Completed→done. Type kept as-is (no auto-retype; owner reviews, see warnings).
- Untyped rows → Watchlist. Undated Dating rows → Date ideas. Template row "Event" dropped.
- Dates: Notion date-only → `date`; Notion datetime → KL local `date`+`time` (none in this export).
- Course relation → course id. Courses get `aliases`.
- Places: Stamp of Approval → `approved=true`, `rating=null` (no invented ratings). Hours → open_when + closed_on. Area "Pending" → [] (4 places).
- Neina db → people "Neina" + 24 facts. Ideas both dbs → ideas (channel = source). Soundtracks, Games, channel rules → lists.
- Ids content-hashed (never row position) → re-run stable → import (new ids only) idempotent.

`lib/server/seed.ts importSeed(dir, owner)`:
1. zod-parse every file (fail loud with file + index).
2. Resolve owner user by username; remap `usr_jeremy` → owner.id and `cal_jeremy_main` → owner's default calendar id in ALL rows.
3. Convert bools, JSON. Missing timestamps → schema defaults. One transaction, `INSERT … ON CONFLICT(id) DO NOTHING` (FR-IM2: new ids only, existing rows never touched, app edits win; only items/blocks have `updated_at`, so no timestamp compare). Owner wants Notion to win? Delete row in app (or `--replace` flag in dev CLI = DO UPDATE).
4. Rebuild `search_fts` for owner.
5. Compare inserted+skipped counts to `_report.json` counts → mismatch = rollback + error. Test: edit a row, re-import, edit survives.

Warnings to show in Settings > Import (from report): 4 stale "doing" items from 2024–25, duplicate places (The Podium ×2, Hainan Village Beef Noodle ×2, Cafe/Kafe Bujang Lelang), 4 places unknown area, "Her Birthday" undated, 1 idea > 70 chars. Plus review-found type oddities to fix by hand: "Flight back to miri" (Exam), "Flight Back to Kuching" (Work), "Birthday Nena" 2026 (Work), "Food fest and send car and stuff" (Exam).

## 11. Security checklist

- [ ] argon2id, dummy verify, NULL hash = unknown.
- [ ] Session token hashed at rest; cookie name/secure from ORIGIN scheme; absolute expiry; rotate on login + password change.
- [ ] Origin check all non-GET incl. missing Origin. Form `checkOrigin` on.
- [ ] Rate limits: login (user|ip, ip, user slowdown), redeem, signup, setup.
- [ ] ADDRESS_HEADER fail-closed; app port unpublished in Stage C.
- [ ] Invites/keys/ics token: 60+ bits, HMAC with APP_SECRET, shown once, atomic single use.
- [ ] `next` redirect regex + origin compare.
- [ ] /setup atomic + setup_done flag.
- [ ] Every query scoped in repo layer. Test: user B gets 404 on every user A id for every module.
- [ ] Shared data filtered server side; notes/course/steps never to grantees; private items always busy. Test JSON for leaks.
- [ ] zod `.strict()` on all bodies.
- [ ] Markdown via DOMPurify. No raw `{@html}`.
- [ ] CSP + headers (sec 5).
- [ ] Secrets only env (APP_SECRET, SETUP_TOKEN, TUNNEL_TOKEN). `.env*` gitignored except examples. `data/` gitignored (personal data).
- [ ] Logs never print tokens, keys, codes, passwords, cookies.

## 12. Tests

Unit (Vitest): quickadd table (≥30), status cycle timestamps, snap math incl. zero-length, midnight-crossing clip, `lib/time` (FullCalendar end +1, ISO week-year 2026-W53, today in KL at 23:30 UTC), share key normalise (with/without `LT-`, O/0, I/1), filterItem/filterBlock all cases + JSON leak test, grant revoke→redeem resurrect, session sliding + absolute cap, rate limits, open-now (Night after midnight, closed_on prev day, unknown hours), seed zod + remap + idempotent second run.
E2E (Playwright, fresh temp DB): setup → setup 404 after → login remember/no-remember (cookie Max-Age present/absent) → import → month colour chips → cycle persists → drag-create block → quick add → invite → second user signup → key redeem → overlap filters (no hidden titles in network) → revoke → access gone → reset-password script.

## 13. Conventions

- No `any`. zod at every boundary. Env parsed once in `env.ts`.
- Server-only code in `lib/server/`.
- Repo helpers own SQL + scoping. Routes call repo only.
- Dates only via `lib/time.ts`.
- Commit small. Conventional commits. Never commit `data/` or `.env`.
