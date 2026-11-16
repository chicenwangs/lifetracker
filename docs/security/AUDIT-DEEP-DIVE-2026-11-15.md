# Audit deep dive — Sections A / B / C

**Target:** Life Tracker `v2.0.4` (`97e67fc`, HEAD at review time)
**Companion:** [`SECURITY-AUDIT-2026-11-15.md`](./SECURITY-AUDIT-2026-11-15.md) — ranked findings H-1…L-9
**Date:** 2026-11-15
**Mode:** code-level walk of the request pipeline (A), the control families (B), and an honest account of what was and was not actually read (C).

Verdict words used below:

| Word | Meaning |
|---|---|
| **Holds** | I tried to break it in code and in the throwaway build; it resisted. |
| **Holds, with caveat** | The control is correct but depends on configuration or a neighbouring control. |
| **Gap** | Missing or partial control. Ranked in the main report unless marked *observation*. |
| **Debt** | Works as designed, but will hurt later (growth, maintenance, operability). |

New items found in this pass are **N-1…N-6**; they are *not* new High/Medium findings on their own. Their disposition is in §C.3.

---

## Part A — the 15 pipeline stages

Order is request → response, then the things that act outside a request (jobs, purge, clients, release, ops).

| # | Stage | Verdict | Main reference |
|---|---|---|---|
| A1 | Edge and transport | Holds, with caveat | M-1, M-7 |
| A2 | Boot and configuration | Holds | — |
| A3 | Request admission | Holds, with caveat | N-2, L-8 |
| A4 | Authentication | Holds | L-5, M-4 |
| A5 | Authorization and tenancy | Holds | — |
| A6 | Input validation | Holds | N-2 |
| A7 | Data model and persistence | Holds | M-3 |
| A8 | Concurrency and transactions | Holds | N-6 |
| A9 | Uploads and file serving | Holds | M-5, N-5 |
| A10 | Search and derived read models | Holds | L-2 |
| A11 | Jobs, reminders and push | **Gap** | H-2, N-3 |
| A12 | Retention, deletion, GC | Holds, with caveat | N-4 |
| A13 | Client rendering and service worker | Holds | L-8 |
| A14 | Android shell | Holds, with caveat | L-3, L-4 |
| A15 | Build, release and operations | **Gap** | M-6, M-7, L-6, L-7 |

---

### A1 — Edge and transport

**What happens.** Cloudflare terminates TLS and the tunnel (`deploy/compose.yaml`, `cloudflared` profile). Nothing is published to the host; `ADDRESS_HEADER=CF-Connecting-IP` makes the app fail closed if the header is missing. The app itself only ever speaks HTTP on `:3000`.

**Attacked.** Live `curl -I https://…` and `curl -I http://…`; header set review; tunnel/compose review.

**Verdict: holds, with caveat.** The network shape is right: no published port, no direct origin, and a forged `CF-Connecting-IP` is only possible from inside the compose network. Two caveats:

- **M-1** — there is no `Strict-Transport-Security` and the origin serves `http://` with `200`, so the edge is not enforcing HTTPS today. The app cannot fix the first byte; the edge must.
- **M-7** — `cloudflared` defaults to `latest`, has no `cap_drop: [ALL]` and no read-only rootfs (the app container does).

Certificate handling for the Android WebView is the platform trust store; no pinning. Acceptable for a personal instance, but it means a device-trusted CA can read planner traffic.

---

### A2 — Boot and configuration

**What happens.** `hooks.server.ts` `init` → `initEnv()` (zod, fail fast) → `openDb()` → `migrateDb()` → `purgeAll()` → hourly purge timer → `jobs.start()` → graceful `sveltekit:shutdown` closes SQLite.

**Controls that matter.**
- `ORIGIN` must be a bare origin (no path, no trailing slash, correct scheme); everything else is refused at boot (`env.ts`).
- `APP_SECRET` ≥ 32 chars, `SETUP_TOKEN` empty or ≥ 20 chars; no defaults that silently weaken production.
- `openDb()` sets `chmod 600`, `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.
- Migrations run with FKs **off** (to survive table rebuilds), then `PRAGMA foreign_key_check` and a hard failure if violations remain (`db.ts`).
- The boot log prints origin/secure-cookies/proxy-header mode, never secrets.

**Attacked.** Reviewed every env branch, the migration runner, and the failure paths. Bad values abort boot rather than degrade. Migration + FK check is better than most hobby deployments.

**Verdict: holds.** Only observation: secret strength is length-only (32 × `a` passes). That is an operator responsibility, not a code flaw; `APP_SECRET` rotation invalidates outstanding invite/share codes but not sessions.

---

### A3 — Request admission

**What happens (in order).** `ADDRESS_HEADER` must be exactly one IP literal (except `/healthz`) → **every non-GET must carry `Origin === ORIGIN`** → body-size check → session load → guard → response headers (CSP is SvelteKit's nonce CSP; plus XFO, nosniff, Referrer-Policy, Permissions-Policy, `private, no-store` when signed in).

**Attacked.** Missing/foreign/`null` Origin, `Referer` only, proxy-header lists, path-normalisation tricks, unauthenticated `/api/*`, body with and without `Content-Length`.

**Verdict: holds, with caveat.**

- The origin check is an exact string compare and is applied before routing; form actions are covered too. This is why the CSRF row in the main report is a "held" control, not a finding.
- **N-2 (new, folds into M-5):** the 1 MB JSON cap reads `Content-Length` only. A chunked request without that header reaches adapter-node's `BODY_SIZE_LIMIT=26M`, on any route including public `/login` and `/signup`. Not a data-exposure bug; it is a cheap 26× amplification of the memory/CPU cost of an unauthenticated request.
- **L-8:** no COOP/CORP. Low.
- `/healthz` is deliberately exempt from the proxy check and from auth (the container's own healthcheck calls `127.0.0.1`). That is also why **L-1** exists.
- `/signup` stays in `PUBLIC` even when sign-up is closed. The page renders a form that will always fail; it should 404 or redirect. Usability and attack-surface hygiene, not a vulnerability.

---

### A4 — Authentication

**What happens.** `login()` serialises per client IP, then `loginOnce()`:
- normalises the username and rejects characters that could forge a rate-limit key (`|`);
- checks pair/IP/user counters before doing work;
- adds a 2 s delay once the username has 20 failures;
- verifies Argon2id (`m=19 MiB, t=2, p=1`) with a dummy verify for unknown users (flat timing);
- on success clears pair/user counters, rehashes old parameter tags, **kills the incoming session id** (fixation), and issues a new 160-bit token;
- cookies are `__Host-lt_session`, `HttpOnly`, `Secure` when `ORIGIN` is https, `SameSite=Lax`, `Path=/`.

**Attacked.** Fixation, cookie flags, timing, lockout thresholds, username-key forgery, unicode/case variants, open redirect via `next`, password policy (`password1234` accepted — L-5).

**Verdict: holds.** Argon2 parameters, dummy verify, key normalisation and fixation handling are all correct. The weaknesses are **M-4** (username-keyed hard lock) and **L-5** (policy + blocklist), not the verification path.

**N-1 (new, candidate L-10):** in invite-only mode, `signupOnce()` checks `usersRepo.byUsername()` **before** it validates the invite code, and the "username taken" branch does not consume a rate-limit failure. An unauthenticated attacker can therefore enumerate usernames with unlimited rate by posting a well-formed but bogus code plus a candidate username: `"Username taken."` vs `"Invite code not valid."` This is the discovery step M-4 needs. Fix: validate the code first (or return the same generic error and count every attempt), and rate-limit all signup attempts per IP.

---

### A5 — Authorization and tenancy

**What happens.** Two layers:
1. Route level: every API handler goes through `api()` and calls `me()`, `admin()` or `need*()`; page loads use `locals.user` / `admin()`.
2. Data level: repository functions take `ownerId` as the first argument and every query filters on it; shares are resolved by `shares.level()` / `need()`; calendar grants are filtered server-side in `access.ts` before serialisation.

**Attacked.** Scripted matrix over all **57** `+server.ts` files (56 are API routes): **zero** handlers bypass `me()`/`admin()`/`need*()`. Dynamic cross-tenant GET/PATCH/DELETE, share escalation (view→edit, re-share, move, archive), admin pages as member, unauthenticated API, and hidden-calendar filtering.

**Verdict: holds.** This is the strongest part of the codebase.

- `level()` returns `owner` immediately for the owner, otherwise a share row, otherwise (for a record page) the page its database sits on — with a `page_id !== id` guard. A cycle would need two pages to be record pages of each other's databases; the share check terminates before recursion for any page the viewer can actually reach, and ids are 80-bit random, so it is not reachable as an attack.
- Shared calendar filtering never sends hidden titles, notes, steps, parent ids, private flags or real ids (busy rows get a per-viewer HMAC id). Verified in `access.ts`.
- Natural consequence: **M-3** has no *authorization* escape; it is a lifecycle/ops gap.

---

### A6 — Input validation

**What happens.** Every JSON API body goes through `body(event, zodSchema)` with `.strict()` objects; params are `.max(40)` strings passed to scoped repo functions; queries are sliced (`q.slice(0, 100/200)`); SQL is always prepared or Drizzle-built; FTS input is tokenised to quoted prefixes (`search.ts` `toMatch`), never concatenated into `MATCH`.

**Page documents** get a dedicated validator (`pages.ts` `check`): 23 allowed node types, per-node attribute allowlists, `href` restricted to `http(s)://`, `mailto:` or an attachment path, images must reference an uploaded `att_…` id, **depth capped at 40**, doc size capped at 1 MB, block count at 5000, and text extraction for FTS.

**Attacked.** SQL/FTS syntax, markdown/HTML, filename CRLF and traversal, oversized docs, unknown node types, link schemes, `data:` URIs.

**Verdict: holds.** Correction to an assumption I carried into this pass: the doc schema **does** have a nesting depth cap (40) — I had noted "no depth cap" earlier; that was wrong. The remaining input weakness is **N-2** (transport-level size check), not schema-level parsing.

---

### A7 — Data model and persistence

**What happens.** 9 forward-only migrations (`0000_init` … `0008_v2_shares`), 60+ FKs with deliberate `CASCADE` / `SET NULL` behaviour, `COLLATE NOCASE` hand-patched for usernames, CHECK constraints in SQL where Drizzle would rebuild the table, and indexes on session user, shares, etc.

**Reviewed.** Schema vs. repo usage, cascade trees, soft-delete columns (`deleted_at` on items/blocks/pages/notes), notice that `users.password_hash = NULL` means "cannot log in" and is already rejected by `loadSession`.

**Verdict: holds.** Two structural notes for **M-3**:

- **Disable is a one-line primitive already:** setting `password_hash = NULL` blocks login and the next request drops the session (`auth.ts` `loadSession`).
- **Delete is mostly cascade-ready**, but attachment *files* are not in the DB cascade: `attachments.gc()` only removes files whose DB row it is deleting. A future `DELETE FROM users` would leave the user's upload files on disk forever. A user-delete feature must delete `data/uploads` files first (or add a directory-vs-DB orphan sweep).

---

### A8 — Concurrency and transactions

**What happens.** One Node process, one SQLite writer; `txImmediate()` (`BEGIN IMMEDIATE`) for check-then-write paths (setup, redeem, signup, page move, keep writes); `serial(key)` for "check limit → await argon2 → record result" on login (per IP) and signup (global).

**Reviewed.** Page move cycle check inside the transaction; `setPins`; undo; reminder claim (`UPDATE … RETURNING` inside a transaction); duplicate-username race (re-check inside the transaction); share upsert.

**Verdict: holds.** No double-spend or lost-update path found on the security-relevant writes.

- **N-6 (new, debt, folds into M-5):** `slide()` writes `sessions.last_seen_at` on every request once 5 minutes have passed. Parallel requests can each decide to write. It is a bounded, low-value write amplifier, not a correctness bug, but it is exactly the kind of write that gets worse with a prefetch-happy client.
- `serial('signup')` is **global**, not per IP (the comment says "per IP"). This is safe but means one slow Argon2 sign-up delays all others; at worst a mild signup-throughput DoS that the global 20/15 min cap already bounds.

---

### A9 — Uploads and file serving

**What happens.** `POST /api/attachments` (the only route exempt from the 1 MB cap) → extension allowlist → magic-byte check → streaming write to `data/uploads/.tmp` → atomic rename → DB row; served by `GET /api/attachments/:id` with `readable()` (owner or someone with access to a note/page that references it), `nosniff`, `Content-Disposition`, `CSP default-src 'none'; sandbox`, `private, no-store`.

**Attacked.** HTML-as-PNG, SVG, HTML, double extension, `..%2f`, CRLF filename, 2 MB vs cap, cross-user fetch, share-based fetch.

**Verdict: holds.** The allowlist/magic/serve path is well built. PDF and office formats are `attachment`-only; only images are `inline` — the earlier summary's "PDF inline" note was wrong.

**Gaps.**
- **M-5:** no per-user byte or file-count quota; only per-file size.
- **N-5 (new, observation, folds into H-2):** `subscribe()` deletes **any** `push_subscriptions` row with the same `endpoint_hash`, without a user filter. It needs the victim's endpoint string (not discoverable), so it is not a practical cross-user unsubscribe; still, a `WHERE user_id = ?` is the correct scope.
- `gc()` removes DB rows it deletes but does not sweep files that have no row (see A7 — matters when delete-user arrives).

---

### A10 — Search and derived read models

**What happens.** FTS5 `content_search` is maintained on write and queried with owner scoping; planner titles use a `LIKE` with escaped `%`/`_`; the knowledge graph is built per request from my pages/links only, dropping edges to anything I cannot see; `nativeSync()` builds an Android payload from the owner's own data and hidden-type prefs.

**Attacked.** FTS operators, cross-tenant search, graph leakage (ids/titles/counts of invisible pages), archived filtering, `includeArchived`.

**Verdict: holds.** No search-side leak found. Note the accepted design: the graph is owner-only and capped at 5000 nodes.

- **L-2** (already ranked) covers the only write-on-read in this layer's neighbour (`GET /api/pages/:id` touches `last_opened_at`).

---

### A11 — Jobs, reminders and push

**What happens.** `jobs.start()` runs a timer; `tick()` claims up to 50 due reminders with `UPDATE … RETURNING`, re-resolves relative rules, checks per-kind notification prefs, sends push to every live device, and records sent/missed. Failures back off 2/4/8/16 min up to `MAX_ATTEMPTS`.

**This is the one genuinely weak stage.**

- **H-2 (High):** the push endpoint supplied by the user is passed straight to `webpush.sendNotification()` (`jobs.ts` L56-80). The subscribe schema only requires an `https://` string; `/api/push/test` triggers a send on demand. Proven on the throwaway build: `https://127.0.0.1:9999/probe` → `201`, listener logged the TCP connect. With open sign-up (H-1) this is unauthenticated SSRF.
- **N-3 (new, robustness):** a reminder is set to `processing` and only moved out of that state after `pushTo()` resolves. If the process dies mid-tick, `STUCK_MS` later puts it back to `scheduled` **without incrementing `attempts`**, so a source that crashes the worker can retry forever. It does not leak data; it can spin the job runner and re-notify.
- No logging of push failures beyond the status code (deliberate: never log endpoint/keys). Good.

**Verdict: gap.** Fix H-2 first (host allowlist + resolved-IP private-range block at connect time + per-user endpoint cap + rate limit), then make the claim/attempt accounting crash-safe (increment attempts on claim or on stuck requeue).

---

### A12 — Retention, deletion and GC

**What happens.** `purgeAll()` hourly: expired sessions, old rate-limit rows, 30-day trash for items/blocks/places, undo entries, keep and page trash, attachment GC. Deleted share rows take effect immediately (no cache). `page_shares` / `keep_note_shares` are hard-deleted on revoke.

**Verdict: holds, with caveat.**

- Trash retention is consistent and documented (30 days).
- **N-4 (new, debt):** `purgeAll()` ends with `// P2: sharekeys.purgeExpired()` — expired share-code rows are never deleted. Live codes are capped at 20, but expired rows accumulate (minimum expiry 24 h). Tiny per row; unbounded over years. Add the one-line purge.
- **M-3** again: no user deletion path, so "right to erasure" today means shell access.
- **M-6** is the retention risk that matters more than any of these: the archive is plaintext.

---

### A13 — Client rendering and service worker

**What happens.** Server-side rendering with Svelte's default escaping. The **only** `{@html}` in the app is `Markdown.svelte`, which pipes `marked` → `DOMPurify` (`USE_PROFILES: html`, tag/attr bans). Other `innerHTML` assignments are static SVG constants (`MonthCalendar`, `WeekCalendar`). `QuickAdd.svelte` explicitly avoids `{@html}`. CSP uses a per-response nonce and `frame-ancestors 'none'`.

The service worker caches **only** `/_app/immutable/*` and `/offline.html`; it never caches pages or `/api/*`. Push payloads carry title/body/route only.

**Verdict: holds.** The XSS surface is one sink, it is sanitised, and the SW cache policy is correct. L-8 (COOP/CORP) is the only header gap.

- **L-2** is visible here: a client prefetch of `/pages/:id` writes a row.

---

### A14 — Android shell

**What happens.** Capacitor WebView loads `https://planner.jeremyjosh.org` (no bundled app code), `allowMixedContent: false`, target/compile SDK 36 (cleartext blocked by platform default), `minSdk 26`. `Native.get()` sends the WebView cookie to `/api/native`; the sync JSON is cached in `SharedPreferences` and rendered by widgets. `Updater` polls GitHub Releases, downloads the first `.apk` asset and hands it to the installer. `allowBackup="true"`.

**Verdict: holds, with caveat.**

- **L-3:** `allowBackup="true"` + `SharedPreferences` cache of planner content (titles, today's schedule) + `app_webview` cookie store. A device backup can carry both.
- **L-4:** no checksum in the updater; Android's signature check is the real mitigation.
- Exported components: `Boot`/widget receivers are exported because the system requires it; `WidgetAction` and the reminder receiver are `exported="false"`; `FileProvider` is non-exported with `grantUriPermissions`. No custom URL scheme or deep-link surface beyond `path` extras handled by the app itself.

---

### A15 — Build, release and operations

**What happens.** CI (`ci.yml`, `contents: read`) runs lint/check/unit/e2e/image build; release (`release.yml`, tag-driven) publishes the image and a deploy bundle, then a separate `apk` job signs the APK with a keystore secret and `contents: write`. Deploy is pull-only; backup is `.backup` → integrity check → gzip → optional rsync; restore stops the app, verifies, swaps the DB, extracts the uploads tar.

**Verdict: gap — but an ops gap, not an app one.**

- **M-7:** Actions pinned by mutable major tag; base images by tag; `cloudflared` may be `latest`; no SBOM/provenance/image signature; the APK-signing job has `contents: write` and the keystore, with no protected environment or required reviewer.
- **M-6:** backups are gzip only; `rsync -a` sends plaintext to the offsite host.
- **L-7:** `restore.sh` runs as root and extracts the uploads tar without `--no-same-owner` or path checks.
- **L-6:** no auth-failure logging/alerting anywhere (`auth.ts` has no log call on failure), no admin audit trail; `handleError` logs method/path/message only (good: never bodies/tokens).
- **L-1:** `/healthz` is unauthenticated and returns version/jobs/backlog. Documented as accepted in `SERVICE-HANDOFF.md` §6; keep it if the monitor needs it, but strip `version` or gate it.
- **Accepted-risk documentation is real:** `/healthz` version, username lockout, and Actions tags are all acknowledged in the handoff. The audit should say so explicitly — it changes "unknown risk" into "known, accepted risk".

---

## Part B — the 12 cross-cutting control families

Same code, cut the other way. "Where" is the place to look if this family ever changes.

| # | Family | Question asked | Where checked | Verdict | Gap / reference |
|---|---|---|---|---|---|
| B1 | Authentication | Can an unauthenticated person become a user, or guess one? | `auth.ts`, `invites.ts`, `setup.ts`, login/signup routes | Holds on verification; policy is weak | **H-1** open signup, **L-5** password policy, **M-4** lockout DoS, **N-1** username oracle, **M-2** no MFA |
| B2 | Authorization & tenancy | Can A read or write B's data by changing an id? | 57 route files, `http.ts` `me/admin/need*`, repo `ownerId` scoping, `access.ts`, `shares.ts` | **Holds** (proved dynamically) | None on data paths; **M-3** is lifecycle, not tenancy |
| B3 | Session & cookie | Can a token be fixed, stolen, replayed, or outlive its window? | `auth.ts` `createSession/loadSession/slide`, cookie options, `/settings/sessions` | Holds | Old session killed on login and on password change; idle/absolute caps enforced; revoke + "sign out others" exist; **N-6** write amplification |
| B4 | CSRF & request origin | Can another site make the browser write? | `hooks.server.ts` origin check; form actions; `safeNext` | **Holds** | Exact-origin compare on every non-GET, including form posts; no token needed and none used |
| B5 | Injection & input | SQL, FTS, template, command, path, header injection | All repo files, `search.ts`, `http.ts`, `pages.ts` doc validator, upload filename handling | **Holds** | Prepared statements only; FTS tokenised; doc schema allowlisted + depth/size caps; **N-2** size-cap bypass is DoS only |
| B6 | Output encoding & XSS | Can stored or reflected input execute script? | `Markdown.svelte`, Svelte escaping, `{@html}` inventory, CSP, upload serving | **Holds** | Single sanitised sink; CSP nonce; uploads served with sandbox CSP; **L-8** COOP/CORP |
| B7 | Uploads & paths | Can a file become code, escape its directory, or be read by the wrong user? | `attachments.ts` KINDS/magic/path, attachment route, `attachment_refs` | Holds | Allowlist + magic + atomic rename + access check; **M-5** no quota; **N-5** file-orphan risk on future user delete |
| B8 | SSRF & egress | Can the server be made to call an attacker-chosen host? | `api/push/+server.ts`, `jobs.ts` `pushTo`, `/api/push/test` | **Gap** | **H-2** — no host allowlist, no private-IP block at connect, no rate limit |
| B9 | Crypto & secrets | Are tokens, codes, passwords and keys handled correctly? | `crypto.ts`, `auth.ts`, `invites.ts`, `sharekeys.ts`, env handling, git history | Holds | Argon2id + random 160-bit tokens + HMAC codes stored as hashes; timing-safe setup token; secrets never logged; secret *entropy* is operator-controlled (A2) |
| B10 | Data protection & retention | Is private data kept private, and deleted when it should be? | `access.ts` filtering, `purge.ts`, `attachments.gc`, backups, `sw.js` cache | Holds, with caveat | Server-side filtering is strong; **M-6** plaintext backups; **M-3** no user delete; **N-4** expired share codes retained; **L-3** Android backup |
| B11 | Availability, logging & detection | Can one user (or stranger) exhaust the service, and would you know? | Rate limits, quotas, compose limits, `hooks.server.ts` error handler, `jobs.ts` logs | **Gap** | **M-5** no quotas/container limits; **M-4** lockout; **L-6** no auth/admin audit trail; **N-2** body cap; **N-3** stuck reminders |
| B12 | Supply chain & deployment | Can a dependency, Action, image or release path be swapped? | `Dockerfile`, `compose.yaml`, `ci.yml`, `release.yml`, `package-lock.json`, `npm audit` | **Gap** | **M-7** mutable tags, no SBOM/signature, unprotected APK-signing job; **L-7** root restore; prod deps clean (L-9) |

---

## Part C — coverage reality

### C.1 What was actually read

| Depth | Files / areas | Notes |
|---|---|---|
| **Line-by-line** | `hooks.server.ts`, `env.ts`, `db.ts`, `auth.ts`, `invites.ts`, `setup.ts`, `serial.ts`, `http.ts`, `crypto.ts`, `ratelimit.ts`, `purge.ts`, `search.ts`, `graph.ts`, `native.ts`, `reminders.ts`, `jobs.ts`, `attachments.ts`, `access.ts`, `dormant.ts`, `repo/{sessions,shares,grants,sharekeys,pages}.ts`, `settings/{sessions,account,import,users}/+page.server.ts`, `signup/+page.server.ts`, `api/push/+server.ts`, `api/shares/*`, `api/search`, `api/quickadd`, `api/native`, `api/reminders/inbox`, `static/sw.js`, `app.html`, `Dockerfile`, `deploy/{compose.yaml,backup.sh,restore.sh,.env.example}`, `.github/workflows/{ci,release}.yml`, Android `Manifest/MainActivity/Native/Updater`, `capacitor.config.json`, `variables.gradle` | This is the basis for every "Holds" above |
| **Structured scan** | All **57** `+server.ts` files (route-auth matrix), all `+page.server.ts` files (params vs `need*`/`admin`), schema FK/cascade list, migrations list, `{@html}`/`innerHTML` inventory, `npm audit`, git history | Mechanically checked, not line-by-line |
| **Behavioural (throwaway build)** | Signup/login/lockout/fixation, IDOR, share escalation, upload allowlist/magic/filename, origin/CSRF, headers, SSRF, body caps, password policy | See Appendix A of the main report |
| **Live (read-only)** | `/signup`, `/setup`, `/healthz`, headers, plain HTTP | No account, no writes |

### C.2 Not touched (and why it matters)

| Area | Status | Risk of the gap |
|---|---|---|
| Svelte components beyond the `{@html}` inventory | Not reviewed component-by-component | Low: Svelte escapes by default and the only raw sink is sanitised. A future `{@html}` would be missed; add it to CI grep. |
| `repo/{items,blocks,keep,databases,calendars,users,meta,itemtypes}.ts` internals | Skimmed for scoping and caps, not fully read | Low: route matrix + dynamic IDOR tests cover the boundary; a logic bug inside a repo would still be owner-scoped. |
| `quickadd.ts` parser (~900 lines) | Not read | Low security risk (pure parsing, bounded input, output goes through the same repos); could contain ReDoS-ish backtracking. |
| `seed.ts` (Notion import) | Read the route, not the importer | Admin-only, one-time, local files. Path handling inside `SEED_DIR` not verified line-by-line. |
| Widget Java (`Widgets.java`, `SyncWorker.java`, `Reminders.java`) | Not read | Low: widget intents are app-internal; `WidgetAction` is non-exported. |
| Android runtime behaviour | No device/emulator | L-3/L-4 are static findings; backup/cookie behaviour not observed on-device. |
| Cloudflare account (WAF, Access, Always Use HTTPS, bot fight) | Not accessible | M-1 is proven from the outside (HTTP 200); the rest of the edge config is unknown. |
| Host/network (SSH, firewall, Docker daemon, offsite host) | Out of scope | The SSRF finding proves container egress; it does not prove reachability of other LAN hosts. |
| Fuzzing / load / memory exhaustion | Not run | N-2 and the 26 MB adapter limit are reasoned, not stress-proven. |
| Multi-replica deployment | Not applicable (single SQLite writer, ADR-001) | Any future replica breaks `serial()` and in-process jobs; re-audit then. |

### C.3 Corrections to the first report

These are accuracy fixes, not new findings. They are also patched into the main report.

1. **M-3 — session revoke exists.** `settings/sessions` lists devices, revokes one session, and has "sign out others" (`removeAllFor` / `removeAllExcept`). The missing pieces are **disable user**, **delete user**, and **admin-initiated password reset over HTTP**. Also note `password_hash = NULL` already disables login (`loadSession` rejects it).
2. **Signup cap wording.** It is **5 accounts per IP per 15 min** and **20 globally per 15 min, then a 60-minute lock** — not "20 per 60 min" as §5 said.
3. **Doc schema has a depth cap.** `check()` rejects depth > 40; my earlier "no nesting cap" note was wrong. Size is capped at 1 MB and 5000 top-level blocks.
4. **PDFs are not inline.** `KINDS.pdf` has no `inline: true`; only png/jpg/jpeg/gif/webp are inline. The general "attachment/inline" wording in §5 was imprecise.
5. **Android cleartext is a non-issue** (already stated correctly in L-3): target SDK 36 blocks cleartext and `allowMixedContent: false`. Do not repeat this as an open item.
6. **Some items are documented accepted risks.** `/healthz` version disclosure, username lockout, and Actions-by-tag are all written down in `SERVICE-HANDOFF.md` §6. They remain findings (accepted ≠ fixed), but the report should mark them "accepted, documented".
7. **"No session revoke" in the ranked table** should read "no disable/delete user or admin reset (self-service revoke exists)".

### C.4 New observations and disposition

| ID | Observation | Severity on its own | Disposition |
|---|---|---|---|
| **N-1** | Unauthenticated username enumeration at signup (code checked after username; "taken" path not rate-limited) | Low | **Promote to L-10** (feeds M-4); fix with M-4 |
| **N-2** | Body-size cap trusts `Content-Length`; chunked requests reach the 26 MB adapter limit on any route | Low | Fold into **M-5** |
| **N-3** | Stuck `processing` reminders requeue without incrementing `attempts` → unbounded retry after a crash | Low (reliability) | Fold into **H-2/M-5** job hardening |
| **N-4** | Expired share-code rows never purged (`// P2`) | Debt | Fold into **A12** housekeeping |
| **N-5** | Push `subscribe()` deletes by `endpoint_hash` without user scope; attachment files can orphan on future user delete | Info | Fold into **H-2** / **M-3** implementations |
| **N-6** | Session `slide()` writes every 5 min per active session (parallel requests can multiply it) | Info | Fold into **M-5** |

Add one line to the ranked table for **L-10** (CVSS 5.3, CWE-204, OWASP A07) so the brief and the issue have a single ID for it.

### C.5 What would change the verdict

The "no critical/high code flaw" verdict rests on three things holding:

1. **Origin check stays exact and early** (`hooks.server.ts`). If it ever moves after routing, every JSON write becomes CSRF-able.
2. **Every new route goes through `api()` + `me/need*`.** The 57-route matrix is clean today; a single hand-rolled handler would break it. This is the control to regression-test in CI.
3. **Server-side filtering stays the only source of shared data** (`access.ts`). Any client-side-only filter would leak hidden calendar items.

None of those depend on the edge, the host, or Cloudflare. The parts that do depend on configuration are exactly the ones in M-1/M-2/M-6/M-7 — and they are the reason the overall grade is "solid app, soft shell".

---

## Appendix — file:line index for the new items

| Item | Where |
|---|---|
| N-1 username oracle | `app/src/lib/server/invites.ts` L139-145 (username check before code check) |
| N-2 body cap | `app/src/hooks.server.ts` L57-59 (`content-length` only); `app/Dockerfile` `BODY_SIZE_LIMIT=26M` |
| N-3 stuck reminders | `app/src/lib/server/jobs.ts` L82-90 (`processing` reset) and L120-128 (attempts only incremented on send failure) |
| N-4 share-code purge | `app/src/lib/server/purge.ts` L45 (`// P2: sharekeys.purgeExpired()`) |
| N-5 push endpoint scope | `app/src/lib/server/jobs.ts` L25-28 (`DELETE … WHERE endpoint_hash = ?` with no user) |
| N-6 session writes | `app/src/lib/server/auth.ts` L145-165 (`slide`, `TOUCH_EVERY`) |
| M-3 primitive | `app/src/lib/server/auth.ts` L136 (`!r.u.passwordHash` → no session) |
