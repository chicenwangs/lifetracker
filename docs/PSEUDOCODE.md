# Life Tracker — PSEUDOCODE (core flows)

Caveman doc. Big picture logic. Per-file pseudocode lives as comments inside each file. FR ids → REQUIREMENTS.md. Rules → TECHNICAL.md.

## 0. Layers

```
browser ── form POST / fetch JSON ──▶ hooks.server.ts (proxy, origin, session, guard, headers)
                                         │
                       routes/*/+page.server.ts  ·  routes/api/*/+server.ts   (zod .strict() parse only)
                                         │
                       lib/server/*.ts   (auth, access, sharekeys, seed, calendar, search …)
                                         │
                       lib/server/repo/*.ts   (ALL SQL, ALL owner/access scoping)
                                         │
                       db.ts ── better-sqlite3 (WAL) ── data/app.db
shared (client+server): lib/time.ts  lib/quickadd.ts  lib/colors.ts  lib/types.ts
```

## 1. Boot

```
init:
  env = zod parse process.env              -> bad = exit(1), name var only
  mkdir(dirname(DATABASE_PATH)); open db; pragmas; migrate('./drizzle')
  purge trash > 30 d, expired sessions, expired unused keys
  timers: keys hourly, trash daily
```

## 2. Every request

```
handle(event):
  if ADDRESS_HEADER set and header missing      -> 400
  if method not GET/HEAD and Origin != ORIGIN   -> 403
  user, session = loadSession(cookie)            # sha256(token) lookup, expiry + absolute cap
  slide(session) at most every 5 min
  if no user and path not public:
     /api/* -> 401   else -> /login?next=<path>
  res = resolve(event); add security headers; return res
```

## 3. Auth

```
setup(token, admin):   setup_done? -> 404 ; constant-time token ; BEGIN IMMEDIATE: users=0 -> admin + calendar -> setup_done=1
login(u, p, remember): limits(u|ip 5, ip 30, u slowdown 20) ; verify (dummy hash if no user)
                       fail -> "Wrong username or password. N tries left."
                       ok   -> clear u|ip ; kill old session ; new session (30 d/90 d or 12 h/7 d) ; redirect safeNext
signup(code, ...):     limit ip 10 ; atomic UPDATE invites used (changes=1) ; member + calendar ; session
logout:                POST only ; delete session ; clear cookie
change password:       verify current ; new hash ; delete other sessions ; rotate current
reset-password.mjs:    stdin pw ; set hash ; delete sessions ; clear login limits
```

## 4. Home load (`/`)

```
today = todayLocal(me.tz)
range = monthGridRange(today)                        # Mon start, 6 weeks
cal   = getCalendar(me, range):
          for a in listAccess(me, overlapOnly):      # own + active grants (if overlap_on)
             items  = items in range (date ≤ to AND COALESCE(end_date,date) ≥ from)
             blocks = blocks overlapping range (UTC)
             map filterItem / filterBlock (server strips hidden data)
dueToday = own items date=today, not done
goals    = goals(me, quarterKey(today))
render: Month 2/3 | Due chips + DayPlanner + Goals 1/3
```

## 5. Status square

```
cycle(item): todo -> doing (started_at=now)
             doing -> done (completed_at=now)
             done -> todo (clear both)
client: optimistic flip ; POST /cycle ; fail -> flip back + toast
```

## 6. Drag

```
month item -> other day:  PATCH {date} (time kept, no tz math) ; fail revert ; ok UndoToast 5 s
month item -> planner:    y -> minutes -> snap15 -> POST block {item_id, start, start+60}
due chip  -> planner:     same (dataTransfer 'application/x-lt-item')
planner empty drag:       create block [snap(down), snap(up)] ; end ≤ start -> start+15
planner body/edge drag:   move / resize ; snap ; PATCH on pointerup ; fail revert
block crossing midnight:  stored once (UTC) ; drawn clipped on each day
```

## 7. Quick add

```
type -> parseQuickAdd(text, {today, now, courses}) -> preview line (client)
Enter -> POST /api/quickadd -> server re-parse (truth) -> create item in MY calendar
rules: whole tokens ; !type ; #known-course ; last date token wins ; dd/mm ; rollover future ;
       default type = course ? Work : Event ; no date = today ; empty title = reject
```

## 8. Sharing (P2)

```
make key:   perm + expiry + visible types + hidden_as -> raw 12 chars -> store HMAC -> show 'LT-XXXX-XXXX-XXXX' once
redeem:     limit 5/15 min ; normalise ; BEGIN IMMEDIATE atomic mark used (not own, not expired/revoked)
            -> upsert grant (resurrect if revoked) ; generic error always
read:       visible = type in set AND not private  -> title only (no notes/course/steps/parent)
            hidden + busy -> 'Busy' with hmac id ; hidden + none -> drop
            block visible only if 'blocks' in set AND linked item visible
write:      edit grant -> status, date/time, move/resize, rename ; nothing else ; updated_by = me
revoke:     revoked_at ; next request gone
overlap:    toggle saves users.overlap_on ; planner lanes Me | them (max 3)
```

## 9. Import

```
python scripts/transform_notion.py   (raw -> data/seed/*.json + _report.json, stable ids)
importSeed(dir, owner):
  zod parse all (fail loud file[idx]) ; remap usr_jeremy / cal_jeremy_main
  one tx: upsert by id, skip rows edited in app since ; rebuild FTS
  counts != _report.json -> rollback
```

## 10. Side modules (P2)

```
places:   filters + openNow (Night 17-02, after midnight = prev day) + pick random + dup warn (cafe≈kafe)
lists:    checklist, reorder, 'Plan as a date' -> Dating item
people:   facts by category, 'Plan it' -> Dating item private=1, never shared
ideas:    4-stage board, channel filter, warn chicenwangs2 > 70 chars
workouts: today split, prefill last kg, log session -> mark 'Workout' block done, 4 ISO weeks progress
search:   FTS5 owner-only, grouped by kind
```

## 11. Build order (P1)

1. env, db, schema, migrate, healthz
2. crypto, ratelimit, auth, setup, login/logout, guard
3. time.ts + tests
4. repo items/blocks/courses/goals + seed import + counts
5. Month calendar + StatusSquare + cycle
6. DayPlanner (create/move/resize/clip) + due chips
7. Quick add + tests
8. Item detail, Week view, Settings (account, sessions, courses, goals)
9. reset-password, e2e P1, acceptance list
