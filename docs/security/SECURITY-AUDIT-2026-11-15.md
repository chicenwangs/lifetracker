# Security audit — Life Tracker

Date: 2026-11-15 · Code audited: `v2.0.4` (`97e67fc`) · Live: `https://planner.jeremyjosh.org`
Status: audit only — no source changes made, nothing deployed.

| | |
|---|---|
| Target | SvelteKit app (`app/`), SQLite/Drizzle, Docker + Cloudflare Tunnel (`deploy/`), Android shell (`mobile/`) |
| Method | STRIDE threat model → static review → dynamic tests on an isolated production build → manual exploit attempts |
| Frameworks | OWASP Top 10:2025, OWASP API Security Top 10, OWASP ASVS 5.0, CWE/SANS, CVSS 3.1, PTES / NIST SP 800-115, MITRE ATT&CK, CIS Docker, SLSA |
| Test data | Throwaway SQLite DB + uploads in `%TEMP%\lt-audit`, temp VAPID keys, `ORIGIN=https://planner.audit.test`, app on `127.0.0.1:5174`. No production request created or changed any data; the live checks were read-only (GET/HEAD/OPTIONS) |

The live instance reports `"version":"2.0.4"` on `/healthz`, i.e. it runs the same code audited here, so the findings below apply to the live deployment unless noted.

---

## 1. Verdict

No critical or high-severity **code** flaw: no auth bypass, no pre-auth data read/write, no tenant escape (IDOR), no SQL injection, no stored XSS, no upload-to-RCE. Those paths are genuinely well built.

Two **High** issues remain, both "defaults and plumbing" rather than core logic:

1. **Sign-up is open by default and is open on the live site right now.** Anyone can create an account, and there is no UI to delete or disable one.
2. **Push subscription endpoint is a server-side request forgery (SSRF)** — an authenticated user can make the server open TCP connections to arbitrary hosts/ports. Chained with #1 it is unauthenticated.

Everything else is Medium/Low: missing HSTS, no MFA, no account lifecycle, lockout-based DoS, missing quotas/rate limits, unencrypted backups, supply-chain pinning, and small information leaks.

**Bottom line:** the hard part is solid; the soft shell (first-run defaults, account lifecycle, ops, supply chain) is not. Both High findings are cheap to fix and neither needs an architecture change.

---

## 2. What was tested

| Area | Technique |
|---|---|
| First-run / setup | token brute force, weak password, replay after `setup_done`, `/setup` 404 gating |
| AuthN | lockout thresholds, user/IP/pair keys, timing, session fixation, cookie flags, `safeNext` open-redirect payloads |
| AuthZ / IDOR | cross-user GET/PATCH/DELETE on items, pages, attachments, databases; share escalation (view→edit, re-share, move, archive); admin pages as member; unauthenticated API calls |
| CSRF / origin | missing Origin, evil Origin, `Referer`, proxy-header spoofing, `X-Forwarded-For` variants |
| Injection | prepared-statement review, FTS5 query construction, Tiptap doc schema, Markdown/DOMPurify payload suite, filename/CRLF injection, path traversal |
| Uploads | allowlist bypass, magic-byte mismatch, SVG/HTML, 1 MB cap, MIME/digest handling, download headers |
| SSRF | push subscribe + test push against a local listener |
| Headers / TLS | CSP + nonce, XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS, plaintext HTTP |
| Ops / supply chain | Dockerfile, compose, backup/restore scripts, CI/release workflows, git history for secrets |
| Android | manifest flags, WebView config, updater, exported components, target SDK |
| Dependencies | `npm audit` (prod and full), lockfile review |

Not performed (see §8): fuzzing, sustained load/stress, Android runtime test on a device, Cloudflare account configuration audit, host/network scan.

---

## 3. Ranked findings

Severity = business risk for this deployment. CVSS 3.1 base is given where a concrete vector is defensible; "control gap" means the score would be artificial.

| # | Sev | Finding | CVSS | CWE | OWASP 2025 | Live |
|---|---|---|---|---|---|---|
| **H-1** | **High** | Open self-registration is the default; no way to remove an account from the UI | 7.3 | CWE-1188, CWE-284 | A01, A02 | **yes** |
| **H-2** | **High** | Push endpoint SSRF → arbitrary internal TCP connect; unrate-limited trigger | 7.4 (8.2 chained with H-1) | CWE-918 | A01 | yes |
| **M-1** | Medium | No HSTS, plaintext HTTP served (edge does not force HTTPS) | 6.8 | CWE-319, CWE-523 | A02, A04 | **yes** |
| **M-2** | Medium | No MFA / second factor anywhere (single password = account) | control gap | CWE-308 | A07 | yes |
| **M-3** | Medium | Account lifecycle incomplete: no disable, delete, or admin password reset in-app (self-service session revoke exists) | control gap | CWE-284 | A01, A07 | yes |
| **M-4** | Medium | Login lockout keyed on username alone → targeted account lockout DoS (15 min, repeatable) | 4.3 | CWE-307, CWE-645 | A07 | yes |
| **M-5** | Medium | No storage quota and almost no rate limits: attachments unbounded, `POST /api/push/test` unthrottled, no container memory/pids limits | 6.5 (7.5 chained) | CWE-770, CWE-400 | A04, A06 | yes |
| **M-6** | Medium | Backups are gzip only, not encrypted; `rsync -a` copies them in clear | 4.4 | CWE-311 | A04 | likely |
| **M-7** | Medium | Supply chain: Actions pinned to mutable major tags, base images by tag, `cloudflared:latest`, no SBOM/provenance/image signature | 5.0 | CWE-1357 | A03:2025 | yes |
| **L-1** | Low | `/healthz` unauthenticated leaks version, job state, reminder backlog | 5.3 | CWE-200 | A02 | **yes** |
| **L-2** | Low | `GET /api/pages/:id` writes `last_opened_at` (side effect on a safe method) | 3.1 | CWE-650 | A04 | yes |
| **L-3** | Low | Android `allowBackup="true"` — WebView cookie jar / prefs can leave the device in a backup | 3.3 | CWE-200, CWE-312 | A02 | yes |
| **L-4** | Low | In-app APK updater verifies no checksum (mitigated by Android's signature check) | 3.7 | CWE-345 | A08 | yes |
| **L-5** | Low | Password policy: 10+ chars and a ~52-entry long-password blocklist; `password1234` is accepted; no breach screening | control gap | CWE-521 | A07 | yes |
| **L-6** | Low | Logging: no alerting on auth failures, no audit trail of admin actions, raw `error.message` logged | control gap | CWE-778, CWE-532 | A09 | yes |
| **L-7** | Low | `restore.sh` extracts the uploads archive as root without `--no-same-owner`/path checks | 3.4 | CWE-59, CWE-732 | A08 | n/a |
| **L-8** | Low | No `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | 3.1 | CWE-346 | A05 | yes |
| **L-9** | Info | 19 dev-only advisories (`drizzle-kit`, `eslint`, `typescript-eslint`, `kit`/`adapter`); 0 in production deps | n/a | CWE-1104 | A03 | no |
| **L-10** | Low | Unauthenticated username enumeration at signup: username is checked before the invite code, and the "taken" answer is not rate-limited | 5.3 | CWE-204 | A07 | yes |

Attack mapping: H-1 → ATT&CK T1078 (Valid Accounts); H-2 → T1190 (Exploit Public-Facing Application) + T1090 (proxy/lateral movement); M-4 → T1110.004 (credential stuffing / lockout abuse); M-6 → T1552 (unsecured credentials).

**Accepted risks.** `SERVICE-HANDOFF.md` §6 already records the `/healthz` version disclosure (L-1), the username lockout trade-off (M-4), the single `APP_SECRET` for all HMACs, and Actions-by-tag (M-7) as accepted. They are listed here because accepted is not the same as fixed; if any of them is no longer acceptable, the fix column is the place to start. The detailed code-level walk is in [`AUDIT-DEEP-DIVE-2026-11-15.md`](./AUDIT-DEEP-DIVE-2026-11-15.md).

---

## 4. Findings in detail

### H-1 — Open self-registration is the default (and is live) · High · CVSS 7.3

**What.** `signupOpen()` returns true unless an admin explicitly stored `signup_open='0'`:

```ts
// app/src/lib/server/invites.ts
export function signupOpen(): boolean {
	return meta.get(SIGNUP_KEY) !== '0';   // absent -> open
}
```

A fresh install therefore accepts public sign-ups before anyone visits Settings › Users. The v1.1.0 tag had the same default, so any instance that was never toggled is open.

**Evidence (live, read-only).**
- `GET https://planner.jeremyjosh.org/signup` → `200`, title `Create account`, form fields `username, displayName, password, confirm` — **no `code` field**, page contains no "invite" text. Invite-only mode renders an invite-code field; it is absent, so the live instance is in open mode.
- `GET /setup` → `404` (first run done, so this is not the setup flow).
- On the throwaway instance, `POST /signup` with `code=` created a working account (`Set-Cookie: __Host-lt_session=…`, `Max-Age=2592000`); the new session then passed `GET /api/items` and could create items/pages.
- The admin UI (`/settings/users`) exposes only sign-up mode, invite create, invite revoke. There is no delete/disable: `DELETE FROM users` and a reset-password HTTP route do not exist (only the CLI `scripts/reset-password.mjs`).

**Impact.** On this deployment: an unauthenticated internet user becomes a first-class tenant. They cannot read existing data (tenant scoping holds — see §5), but they can:
- occupy the instance, consume disk (see M-5), and appear in the share picker;
- phish the owner with a share request ("please review this page") — shares are the intended trust path;
- enumerate usernames through the share API (see L-6/M-4 chain);
- turn H-2 from authenticated into unauthenticated.

With no UI to remove them, cleanup means shell access to the server.

**Fix.**
1. Invert the default: `meta.get(SIGNUP_KEY) === '1'`; add a migration that writes `'0'` for existing installs (setup already creates the admin, so nothing breaks).
2. Hide `/signup` (404) when `signupOpen()` is false instead of rendering a dead form.
3. Add **Delete user** and **Disable user** (plus `sessionsRepo.removeAllFor(user.id)`) to `/settings/users`; ship `scripts/delete-user.mjs` as the interim.
4. **Do now, no deploy:** Settings › Users → switch to invite-only, then review the user list for accounts you did not create.

---

### H-2 — Push endpoint SSRF · High · CVSS 7.4 (8.2 with H-1)

**What.** A subscription endpoint is accepted if it merely starts with `https://`:

```ts
// app/src/routes/api/push/+server.ts
if (!/^https:\/\//.test(s.endpoint)) return json({…bad_endpoint…}, { status: 400 });
subscribe(u.id, s, e.request.headers.get('user-agent'));
```

`POST /api/push/test` then makes the server POST to that URL via `web-push` (`app/src/lib/server/jobs.ts` → `pushTo()`), with no allowlist, no DNS/IP filtering, no port restriction, and no rate limit.

**Evidence (throwaway instance).** Subscribed `endpoint=https://127.0.0.1:9999/probe` → `201 {"ok":true}`; called `POST /api/push/test` → `{"sent":0,"failed":1,"error":"push service error"}` and the local listener recorded:

```
2026-11-15T03:58:59.393Z TCP connect from 127.0.0.1:59618
```

`http://127.0.0.1:9999/x` was rejected (scheme check only), confirming the control is a string prefix, not a destination check.

**Impact.** Blind SSRF to any host/port the container can reach over TLS: internal admin panels, other containers, the Docker host, cloud metadata over TLS, and internal service discovery/port scanning via connect success vs failure. The path is attacker-controlled, so it can also be used to make the server send TLS traffic to third parties (reflector/abuse). Egress is unrestricted by default in the compose file. Nothing on the box speaks TLS on 9999, which is why only the TCP connect is visible — a real internal HTTPS service would receive a full POST.

**Fix.**
- Allowlist destinations: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com` (exact hosts, port 443 only).
- Enforce at connection time, not just at parse time: a custom `https.Agent` with a `lookup` that rejects loopback/private/link-local/CGNAT/ULA ranges (defeats DNS rebinding).
- Cap subscriptions per user (e.g. 10) and rate-limit `POST /api/push/test` (e.g. 3/min/user).
- Keep the failure response generic; do not echo upstream error detail.

---

### M-1 — No HSTS, plaintext HTTP is served · Medium · CVSS 6.8

**Evidence (live).** `curl -I https://planner.jeremyjosh.org/…` returns CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy — **no `Strict-Transport-Security`**. `GET http://planner.jeremyjosh.org/login` returns `200` (the page, over HTTP); `http://…/` returns `303 → /login` over HTTP rather than upgrading to HTTPS. The app never sets HSTS (`hooks.server.ts` sets the other headers) and Cloudflare "Always Use HTTPS" appears off.

**Impact.** An on-path attacker (hostile Wi-Fi, compromised router, malicious proxy) can serve a modified login page over HTTP and capture the password in the POST body; SSL-strip style downgrade is possible for any user who types the bare domain. Session theft is limited by the `Secure` cookie attribute (browsers reject `Secure` cookies from HTTP origins), but credentials are not.

**Fix.** Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` in `hooks.server.ts` when `secureCookies` is true; enable Cloudflare "Always Use HTTPS" (and consider HSTS preload once you are sure the domain is HTTPS-only). Verify with `curl -sI https://… | grep -i strict`.

---

### M-2 — No MFA · Medium (control gap)

Single factor protects everything. Lockout (5 per user+IP pair, 30 per IP, 50 per user) raises the cost of online guessing, and Argon2id makes offline cracking expensive, but a reused or phished password is a full compromise. There is no TOTP, WebAuthn, or recovery-code path; `settings/` has no security section.

**Fix options, cheapest first:** TOTP for the admin account only (one secret column + a verify step in `loginOnce`), then optional WebAuthn for all users. ASVS 5.0 §2.8 wants at least one phishing-resistant factor available; for a personal instance, admin TOTP is a reasonable landing zone.

---

### M-3 — Account lifecycle incomplete · Medium (control gap)

Users can be created but cannot be disabled, deleted, or have their password reset by an admin over HTTP. There is no `deleted_at`/`disabled_at` on `users`, no delete action in `settings/users`, and no HTTP reset route (only the CLI `scripts/reset-password.mjs`).

**What does exist (correction to the first draft).** Self-service session management is real: `/settings/sessions` lists devices and supports "revoke this session" and "sign out other sessions" (`sessionsRepo.removeOwn` / `removeAllExcept`). A new login also kills the session cookie presented to it, and a password change revokes all sessions and issues a fresh one. The primitive for *disable* is already present too: `users.password_hash = NULL` means "cannot log in", and `loadSession` drops the session on the next request.

**Impact.** This is what turns H-1 from an annoyance into an operational problem: there is no in-app way to remove a stranger who signed up, and no way to force a member to re-authenticate after a device is lost short of the CLI. It is also a GDPR/data-ownership gap if anyone else joins, and a future delete-user feature must delete attachment files first (FK cascade removes rows, not files on disk).

**Fix.** `users.disabled_at` (checked in `loadSession` alongside the null-hash check), delete with cascade + upload-file cleanup, `removeAllFor()` on disable, an admin "reset password" that issues a one-time link, and (already done) keep the self-service sessions page.

---

### M-4 — Username-keyed lockout enables targeted DoS · Medium · CVSS 4.3

```ts
// app/src/lib/server/auth.ts
const kPair = `login:u:${u}|${ipk}`;   // LOGIN_PAIR_MAX = 5
const kIp   = `login:ip:${ipk}`;       // LOGIN_IP_MAX  = 30
const kUser = `login:u:${u}`;          // LOGIN_USER_MAX = 50  -> hard 429
```

50 failures against one username in 15 minutes (two source IPs at the per-IP budget of 30 are enough) returns `429 Too many tries` to the legitimate owner. Usernames are discoverable through the share API (`unknown_user` vs success), so the target is trivial to identify. Repeat every 15 minutes and the owner cannot log in.

**Fix.** Keep `kUser` for the 2 s delay only (`LOGIN_USER_SLOW`), never for a hard 429; or lock per user only after failures from N distinct IPs, with exponential backoff instead of a binary lock.

---

### M-5 — Missing quotas and rate limits · Medium · CVSS 6.5 (7.5 with H-1)

- **Attachments have no per-user count/byte quota** (`attachments.ts` caps a single file at `MAX_UPLOAD_BYTES`, nothing else). One account can loop 1 MB uploads until the volume is full; SQLite then fails writes, and the app is down until someone deletes files.
- **`POST /api/push/test` is unrate-limited** (and is the SSRF trigger).
- **Most authenticated write endpoints are unrate-limited**; `items`/`blocks` have a 50k `ROW_CAP` per calendar (good), `databases` have record/property caps (good), but share grants, pages, blocks-per-page, and undo entries are bounded only loosely.
- **No container limits**: `deploy/compose.yaml` sets no `mem_limit`/`cpus`/`pids_limit`, so a runaway job or upload loop starves the host.

**Fix.** Per-user byte quota (sum `byte_size`) with a clear 413 message; rate limit push/test and attachment POST; add `mem_limit`, `pids_limit`, and `cpus` to compose; keep `ROW_CAP`-style caps for pages and shares.

---

### M-6 — Backups are not encrypted · Medium · CVSS 4.4

`deploy/backup.sh` does `sqlite3 .backup` → integrity check → `gzip` → optional `rsync -a` to `LT_OFFSITE`. The archive contains all content plus Argon2id hashes and session token hashes. `umask 077` protects the local copy from other local users, but the offsite copy and the backup host see plaintext.

**Fix.** Encrypt at rest: `age -r <pubkey>` (or `gpg -e`) before the rsync, keep the identity offline; test restore from an encrypted archive in the same run; document the key in the service handoff. Add `sqlite3` integrity + row-count assertions after decrypt.

---

### M-7 — Supply chain not pinned · Medium · CVSS 5.0

- `release.yml` / `ci.yml` use `actions/checkout@v5`, `docker/*@v3..v6`, `setup-node@v5`, `setup-java@v5` — mutable major tags. Anyone who can move a tag can run code with `packages: write` and `contents: write` in the release job (which also holds the Android signing key).
- `FROM node:22-bookworm-slim` by tag (no digest); `cloudflared:${CLOUDFLARED_VERSION:-latest}` defaults to `latest`.
- No SBOM, no build provenance/attestation, no image signature (`cosign`), no Dependabot/Renovate config.
- `cloudflared` has `no-new-privileges` but no `cap_drop: [ALL]` and no read-only rootfs (the app container does — that part is good).

**Fix.** Pin Actions to commit SHAs (Dependabot can keep them fresh), pin base images by digest, set `CLOUDFLARED_VERSION` to a dated tag in `.env`, add `docker/build-push-action` `provenance: true` + `sbom: true`, sign the image with `cosign` keyless, and add a `dependabot.yml`. Raise to High if the release workflow ever runs untrusted PR code with those permissions (it currently does not: `release` is tag-only).

---

### L-1 — `/healthz` information leak · Low · CVSS 5.3

Unauthenticated `GET /healthz` returns `{"ok":true,"db":true,"version":"2.0.4","jobs":true,"reminderBacklog":0}`. Version disclosure gives an attacker an exact target list; `reminderBacklog`/`jobs` reveal whether the job runner is alive (useful for timing an SSRF or a storage-exhaustion attempt).

**Fix.** Keep the Docker healthcheck contract but return `{ok:true}` only; move version/backlog behind an `Authorization: Bearer $HEALTH_TOKEN` or an internal-only listener.

---

### L-2 — Side effect on GET · Low · CVSS 3.1

`pages.get(..., opened=true)` runs `UPDATE pages SET last_opened_at = ?` for the owner (`app/src/lib/server/repo/pages.ts:61`). Consequences: GET is not safe/idempotent, prefetch/prerender writes rows, caching and ETag semantics are muddied, and the write path can be amplified without a body. Shared viewers do not trigger it (good).

**Fix.** Move the touch to an explicit `POST /api/pages/:id/open` (fire-and-forget from the client), or gate it behind `?touch=1`.

---

### L-3 — Android `allowBackup="true"` · Low · CVSS 3.3

`mobile/android/app/src/main/AndroidManifest.xml` allows Android auto-backup. The WebView cookie store (session token for `planner.jeremyjosh.org`) and `SharedPreferences` live in app data, so a device backup can carry a live session to another device. Cleartext is **not** an issue: `targetSdkVersion = 36` blocks cleartext by default and `allowMixedContent: false` is set.

**Fix.** `android:allowBackup="false"`, or `android:fullBackupContent` / `dataExtractionRules` excluding `app_webview/` and `shared_prefs/`. Note the session cookie is `Secure`; excluding the WebView store is still worthwhile.

---

### L-4 — APK updater has no checksum · Low · CVSS 3.7

`Updater.java` fetches `releases/latest` from the GitHub API, takes the first `.apk` asset URL, downloads and hands it to the installer. No SHA-256 comparison, no `Content-Length` sanity check, no certificate pinning. This is largely mitigated: Android refuses to install an APK whose signing certificate differs from the installed app, and the transport is TLS to GitHub. Treat as defense-in-depth (and useful against a compromised release account that can still not re-sign).

**Fix.** Publish `sha256` in the release notes/asset name and verify before `FileProvider` handoff; optionally pin the release signing cert hash in the app.

---

### L-5 — Weak password policy · Low (control gap)

`passwordSchema` = min 10, max 128, and membership in a local blocklist. The list claims "SecLists 10k-most-common: top 1000 + every 10+ char entry", but the file has 1,052 lines and 1,000 of them are shorter than 10 characters — i.e. only ~52 entries can ever match, so the check is close to a no-op for the lengths actually allowed.

**Evidence.** On the throwaway instance, `POST /signup` with `password=password1234&confirm=password1234` was **accepted** (`303 /`, account created). A 5-character password was rejected with `400 "Password needs 10+ characters."`. `password123`, `password1234`, `letmein123` and `iloveyou12` are all absent from the list; `qwertyuiop` is present.

**Impact.** Combined with no MFA (M-2) and unencrypted backups (M-6), a guessable password is the weakest link: online guessing is still slowed by the 5-per-pair lockout and Argon2id, but a leaked DB/backup makes short weak passwords trivial. Raise to Medium if M-2 and M-6 stay open.

**Fix.** Use the full 10k list (all entries, not just 10+), add breached-password screening via HIBP k-anonymity (SHA-1 prefix range, 5 hex chars), and reject passwords equal to/similar to the username or display name. Keep the 10+ minimum and Argon2id as-is.

---

### L-6 — Logging and alerting gaps · Low (control gap)

`handleError` logs `[error] <status> <method> <path>: <error.message>`. Messages can contain SQL fragments, file paths, or payload text; there is no structured audit log for admin actions (sign-up mode change, invite create/revoke, share grant), and no alert on repeated `bad_origin`, `429`, or `401` bursts. Logs go to Docker `json-file` with rotation (good) but nowhere else.

**Fix.** Allowlist error text (log the class + a correlation id), add an append-only audit table for admin/share actions, and a small alert (uptime check or a log-based counter) on auth-failure spikes and `5xx`.

---

### L-7 — `restore.sh` extracts as root · Low · CVSS 3.4

`tar -C data -xzf "$up"` runs as root with no `--no-same-owner`, no `--no-same-permissions`, and no path validation. The archive is generated by `backup.sh` from server-side random keys, so a normal backup is safe; a tampered or crafted archive could write outside `data/` or plant setuid/symlink content. Requires write access to the root-only backup directory, hence Low.

**Fix.** `tar --no-same-owner --no-same-permissions --one-top-level=data -C "$LT_DIR" -xzf "$up"`, then `chown -R 1000:1000 data/uploads`; verify the archive has no `..` or absolute members before extraction.

---

### L-8 — Missing COOP/CORP · Low · CVSS 3.1

No `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`. Impact is small: the app has no cross-origin popups and `frame-ancestors 'none'` + `X-Frame-Options: DENY` already block framing. Add `same-origin` for both as cheap hardening.

---

### L-9 — Dev-only dependency advisories · Info

`npm audit --omit=dev` → **0**. Full audit → 19 (6 low, 13 moderate), all in `drizzle-kit`, `eslint`, `typescript-eslint`, `@sveltejs/kit`/`adapter-node`. None ship in the production image (`npm prune --omit=dev`). Fixes are mostly semver-major; schedule as maintenance, not as a security incident.

---

### L-10 — Username enumeration at signup · Low · CVSS 5.3

In invite-only mode, `signupOnce()` resolves the username **before** it checks the invite code:

```ts
// app/src/lib/server/invites.ts
if (usersRepo.byUsername(p.data.username)) return { ok: false, status: 400, message: 'Username taken.' };
// ...only then:
const used = db().update(invites).set({ usedAt: now }).where(and(eq(invites.codeHash, hmac(norm)), …)).run().changes;
```

An unauthenticated attacker posts a well-formed but bogus code plus a candidate username; `"Username taken."` means the account exists, `"Invite code not valid."` means it does not. The "taken" branch never calls `rl.fail()`, so there is no rate limit on the oracle (the same is true in open mode).

**Impact.** Feeds M-4: you need the username to lock the account. It does not reveal passwords or data, and usernames are only 3–32 chars of `[a-z0-9_.-]`, so the practical gain is targeted lockout and social engineering.

**Fix.** Validate the invite code first (or run both checks and return one generic error), and count every signup attempt per IP regardless of outcome.

---

## 5. Controls that held up

These were attacked and did not break — worth keeping as regression tests.

| Control | Evidence |
|---|---|
| **Tenant scoping (IDOR)** | User B: `GET/PATCH/DELETE` on A's item → `404`; A's item still `200` afterwards. B on A's page before share → `404`. B on A's attachment → `404`. B on `/settings/users` → `404`. Unauthenticated `/api/*` → `401` (JSON), never a redirect or data |
| **Share enforcement** | After a view share: B `GET` page `200`, `PATCH` `403 read_only`, re-share `403 "Only the owner…"`. No access = `404`, so ids are never proof of existence |
| **CSRF / origin** | Non-GET with no `Origin` → `403 bad_origin`; `Origin: https://evil.test` → `403`; form actions covered by SvelteKit's own check |
| **Proxy header trust** | `ADDRESS_HEADER` required; missing header → `400`; comma-list header → `400`; published port is commented out in compose so `CF-Connecting-IP` cannot be forged |
| **Session handling** | `__Host-lt_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`; new token on login and any session id presented to login is deleted (fixation test: old token → `401`); idle/absolute expiry (12 h / 7 d; 30 d / 90 d remembered); renewal window; self-service revoke + sign-out-others exist |
| **Password storage** | Argon2id m=19 MiB, t=2, p=1, params tag checked and rehashed on login; dummy verify keeps timing flat for unknown users |
| **Rate limiting** | Login `429` on the 5th bad attempt for a user+IP pair; signup capped at 5/IP per 15 min and 20 globally per 15 min, then a 60-min lock; password-change capped at 5; setup token capped at 5/IP (code review — see §8 note on form-action status codes) |
| **XSS** | Markdown → `marked` → DOMPurify with `USE_PROFILES: html` + tag/attr bans; `img`, `svg`, `iframe`, `form`, `style`, `on*`, `javascript:` and `data:text/html` payloads all neutralised. CSP has a per-response nonce, no `unsafe-inline` for scripts; `frame-ancestors 'none'` |
| **SQL injection** | All queries are prepared statements or Drizzle builders; FTS5 MATCH input is not concatenated; dynamic table/column names come from a fixed map |
| **Uploads** | Extension allowlist → magic-byte sniff → size cap; `.png` containing HTML → `400 bad_content`; `.svg`/`.html` → `400 bad_type`; 2 MB vs 1 MB cap → `413`; `..%2f` name → stored as `pwn.png`; CRLF name → sanitised (`X-Injected 1.png`), no header injection; downloads are `nosniff`, `Content-Disposition` (images inline, everything else attachment), `CSP: default-src 'none'; sandbox`, `private, no-store` |
| **Open redirect** | `next=//evil.test`, `/\evil.test`, `https://evil.test` → `location: /`; `/%2f%2fevil.test` stays local; only path-absolute same-origin values pass |
| **Headers** | CSP with nonce, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` deny-list, `Cache-Control: private, no-store` on authenticated pages |
| **Container hardening** | `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs `/tmp`, non-root `USER node`, `init: true`, healthcheck, log rotation, no published port in the tunnel profile |
| **Secrets hygiene** | No `.env`, DB, key, keystore, or `data/` content ever committed (`git log --all --diff-filter=A` clean; only `data/.gitkeep`); `.dockerignore` excludes them; env is validated at boot and fails fast; tunnel token is in a separate `tunnel.env` the app never sees |
| **Git history** | Full-history scan for secrets, keys, dumps → nothing |

---

## 6. Do these today (no deploy, no downtime)

1. **Close registration.** Settings › Users → sign-up mode **invite-only**. Then read the user list; disable/remove anything you did not create. This kills H-1 and makes H-2 require an invited account.
2. **Force HTTPS at the edge.** Cloudflare → SSL/TLS → Edge Certificates → **Always Use HTTPS** on; add an HSTS rule/header (`max-age=31536000; includeSubDomains`) once you are sure no plain-HTTP client depends on the site.
3. **Trim `/healthz`.** If you cannot deploy yet, put a Cloudflare WAF rule in front of `/healthz` (allow your monitor IPs, block the rest) — it leaks the version to anyone.
4. **Check the backup target.** Confirm `LT_OFFSITE` points at a host you trust and that the archive is not world-readable; plan the `age`/`gpg` change (M-6).

Do **not** rotate `APP_SECRET` casually: it HMACs invite codes, share codes and busy ids — rotating invalidates outstanding codes (sessions are hashed with SHA-256, so they survive).

---

## 7. Suggested remediation order (one PR each)

| PR | Scope | Files |
|---|---|---|
| 1 | Sign-up closed by default (+ migration), hide `/signup` when closed | `app/src/lib/server/invites.ts`, `app/src/routes/signup/*` |
| 2 | Push SSRF: host allowlist + connect-time private-IP filter + per-user cap + rate limit | `app/src/routes/api/push/+server.ts`, `app/src/routes/api/push/test/+server.ts`, `app/src/lib/server/jobs.ts` |
| 3 | HSTS header + HTTP→HTTPS upgrade check; drop version from `/healthz` | `app/src/hooks.server.ts`, `app/src/routes/healthz/+server.ts` |
| 4 | Account lifecycle: disable/delete/admin reset (self-service session revoke already exists) | `app/src/lib/server/repo/users.ts`, `app/src/routes/settings/users/*`, `app/src/lib/server/auth.ts`, migration |
| 5 | Lockout: username counter = delay only; no hard 429; validate invite before username (L-10) | `app/src/lib/server/auth.ts`, `app/src/lib/server/invites.ts` |
| 6 | Quotas + limits: attachment byte quota, push/test rate limit, compose `mem_limit`/`pids_limit`/`cpus` | `app/src/lib/server/attachments.ts`, `deploy/compose.yaml` |
| 7 | Ops: encrypted backups, hardened restore, audit log + alerts | `deploy/backup.sh`, `deploy/restore.sh`, `app/src/hooks.server.ts` |
| 8 | Supply chain: SHA-pinned Actions, pinned images, SBOM/provenance, cosign, Dependabot; Android `allowBackup=false`; APK checksum | `.github/workflows/*`, `deploy/compose.yaml`, `app/Dockerfile`, `mobile/…/AndroidManifest.xml`, `mobile/…/Updater.java` |

---

## 8. Limitations

- **Dynamic tests ran against a local production build**, not the live server; the live checks were unauthenticated and read-only. Findings marked "live" are confirmed from the live surface; the rest are confirmed on identical code.
- **No fuzzing** of the JSON API, Tiptap doc schema, or import paths; no sustained load/stress test; no memory-exhaustion test of the 5000-node doc cap.
- **No Android runtime test** (no device/emulator): manifest and updater reviewed statically; the WebView hardening depends on Capacitor defaults (`allowMixedContent: false`, `targetSdk 36`).
- **SvelteKit form actions return HTTP `200` with a serialized `{type,status,data}` body** for non-HTML clients, so form-action results (login, setup, signup) were read from that body's `status`, not the HTTP status line. API routes (`/api/*`) use real status codes.
- **No host/network assessment**: Cloudflare account settings (WAF, bot fight, Always Use HTTPS) and the server's SSH/firewall posture were not in scope; the SSRF finding shows egress from the container is unfiltered, but internal network reachability was only proven for `127.0.0.1`.
- **CVSS scores are base metrics only**, computed for the described vector; no temporal/environmental adjustment. Control-gap items are ranked by business risk, not scored.
- Single-replica SQLite assumed (ADR-001); nothing here covers multi-replica deployment.
- This audit does not certify the app; it is a point-in-time review of `v2.0.4` and the live configuration as observed on 2026-11-15.

---

## Appendix A — dynamic test log (throwaway instance)

| Test | Result |
|---|---|
| Setup gating | `GET /` → `303 /setup`; `/setup` reachable only before first run; after a valid run `/setup` → `404`, signup requires setup done |
| Weak password at signup | `password1234` **accepted** (`303 /`, account created); `Ab1!x` → `400 "Password needs 10+ characters."` |
| Cookie flags | `__Host-lt_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=2592000` on remember |
| Session fixation | old token after login → `401` |
| Login lockout | attempts 1–4 `400` with a countdown, 5th → `429` (pair limit 5) |
| Signup with empty code | account created, session issued (`201`-equivalent `200` + cookie) |
| Cross-tenant item read/write/delete | `404 / 404 / 404`, owner still `200` |
| Page share then edit | `200` read, `403 read_only`, re-share `403` |
| Admin page as member | `404` |
| Username enumeration via share | `admin` → share created; `nobody_xyz` → `unknown_user` |
| Upload: html-as-png / svg / html / 2 MB | `400 bad_content` / `400 bad_type` / `400 bad_type` / `413` |
| Upload: traversal & CRLF names | stored as `pwn.png` / `X-Injected 1.png`, no injected header |
| Download headers | `nosniff`, `attachment`/`inline`, `CSP default-src 'none'; sandbox`, `private, no-store` |
| CSRF: missing / evil Origin | `403 bad_origin` both |
| Proxy header missing / list | `400` both |
| Open redirect `next` variants | all → `location: /` |
| Push SSRF | subscribe `https://127.0.0.1:9999/probe` → `201`; test push → TCP connect logged; `http://` → `400 bad_endpoint` |
| Live `/signup` | `200`, no invite field, no "invite" text → **open registration** |
| Live `/setup` | `404` |
| Live `/healthz` | `{"ok":true,…,"version":"2.0.4",…}` |
| Live HSTS | absent; `http://…/login` → `200` |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Appendix B — evidence snippets

```
# live sign-up surface (read-only)
GET https://planner.jeremyjosh.org/signup -> 200
  fields: viewport, username, displayName, password, confirm      (no "code")
  body contains "invite": false

# live headers
HTTP/1.1 200 OK
content-security-policy: default-src 'self'; … script-src 'self' 'nonce-…'; frame-ancestors 'none'
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=()
(strict-transport-security: absent)

# live plaintext
GET http://planner.jeremyjosh.org/login -> 200          (no 301/308 to https)

# SSRF proof
POST /api/push {"endpoint":"https://127.0.0.1:9999/probe", …} -> 201 {"ok":true}
POST /api/push/test -> {"sent":0,"failed":1,"error":"push service error"}
listener: 2026-11-15T03:58:59.393Z TCP connect from 127.0.0.1:59618

# IDOR proof
B GET  /api/items/itm_…  -> 404      A GET -> 200
B PATCH /api/pages/pg_…  -> 403 {"code":"read_only"}   (after a view share)
B POST /api/shares/page/pg_… -> 403 "Only the owner …"
```
