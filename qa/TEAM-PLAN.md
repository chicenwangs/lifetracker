# Autonomous team plan — one release: v4.0.0

Caveman doc. Plan v3, 2026-11-25. Status: **approved 2026-11-25, built.** Contract `qa/TEAM-LOOP.md`, scripts `qa/team/`, prompts `qa/team/PROMPTS.md`.
Team: LEAD = Opus 5.5 in opencode · 5 workers = opencode, DeepSeek v4.1 flash 1017 (max). PC on 24/7.
Mode: continuous and autonomous, **except one gate: the owner approves tag v4.0.0.**
Borrows from: `docs/v3/QA-LOOP.md` (5 passes, ledger, filing), `qa/MOBILE-QA-3.1.2.md` (roles, coord, locks, host
guard, emulator), `qa/BUILD-LOOP.md` + the v3.2 build report (worktrees, review, merge, incidents).

Owner decisions in this version (2026-11-25):
- No v3.2 / v3.3 tags. Everything (v3.2 work on main, v3.3 scope, v4.0 scope) ships together as **v4.0.0**.
- The owner approves the v4.0.0 tag. Before that: double and triple checks (§6).
- The phones update when the owner updates them; no draft-release trick needed.
- After deploy: documentation update, then a full code audit by the same team (§8, §9).
- Every prompt comes with a PowerShell command that opens opencode in the right folder (§11).
- Live site: no dummy account, no QA on live. Read-only smoke only (§7c).

---

## 1. Phases

| # | Phase | Who | Ends when |
|---|---|---|---|
| 0 | Setup PR: contract, scripts, agent files, DESIGN + wireframes, rule changes in CLAUDE.md/AGENTS.md | LEAD | merged, CI green |
| 1 | QA ×3 on current main (`8bc3878`, the v3.2 work) | QA roles | 3 rounds done, issues filed |
| 2 | Fix S1 + S2 + small S3 from phase 1 | build roles | merged or blocked |
| 3 | Build milestone **M1** = v3.3 scope (PRs 8–14, migration 0011) | build roles | merged or blocked |
| 4 | QA round on M1 + fixes | QA → build | no open S1/S2 from M1 |
| 5 | Build milestone **M2** = Pages overhaul (PRs 15–31, migration 0012) | build roles | merged or blocked |
| 6 | QA ×3 on the whole app + fixes + **pre-tag security audit** of everything changed since v3.1.2 | QA → build | no open S1/S2 |
| 7 | **Release candidate**: version bump PR, release notes, upgrade docs, then checks 1 → 2 → 3 (§6) | LEAD + TESTER | RC report written. **Supervisor stops. Waits for the owner.** |
| 8 | Owner approves → tag v4.0.0 → post-tag checks (§6d) | owner, then LEAD | release workflow green, APK + image verified |
| 9 | Owner deploys. Loop watches live `/healthz`. | owner | live shows 4.0.0 |
| 10 | Live smoke + "now live" documentation PR (§8) | LEAD | docs PR merged |
| 11 | Full code audit of the whole codebase → issues (§9) | QA roles | audit report + issues. **Everything stops.** |

M1 and M2 are milestones, not releases: no tag, no version bump, just a QA checkpoint so problems surface early.
Blocked tasks never stop the line. They go to `blockers.md` and are listed in the RC report.
Rough length: 6–9 days of continuous running to phase 7.

### 1b. What stays the owner's

- Approving the tag (phase 8). Deploying (phase 9). The real-data copy test before deploying.
- Answering `blockers.md` (optional, any time; LEAD re-reads it every phase).
- Agents never deploy, never touch `data/app.db`, `deploy/`, the homelab, or log in to the live site.

---

## 2. Usage (Opus in opencode)

- opencode bills Opus through whatever provider it is signed in with. With an API key: pay per token, no 5-hour pause.
  **Set a spend cap with the provider before starting.**
- Cost = (1) every LEAD turn re-sends its context, (2) reading diffs and findings.
- LEAD never polls on a timer. It runs `qa/team/wait.ps1`: a blocking command that returns when a worker's
  `out.jsonl` grows, CI finishes, or 25 min pass. (Unverified: opencode's shell timeout. The script returns before
  it; the LEAD just calls it again.)
- REVIEWER and SKEPTIC (DeepSeek) do first-pass review and challenges. LEAD reads their notes + the diff. LEAD builds
  no PRs.
- Each phase starts fresh opencode sessions, so no context grows for days. State lives in files.

---

## 3. Supervisor (24/7)

**As built (2026-11-25).** The opencode CLI flags on this PC couldn't be verified, so the supervisor does not start
the AI sessions. The owner opens the 6 opencode sessions once (one folder each, prompts in `qa/team/PROMPTS.md`);
each session loops on its own with `wait.ps1`. The supervisor is a plain script that runs everything else.

- `qa/team/run.ps1` (copied to `C:\Users\Public\lt-team\bin`), Task Scheduler at logon, restart on failure, one
  instance. Every 60 s: reads messages to SUPERVISOR, moves phases, fetches origin (5 min), watches PR CI (3 min,
  sends `ci_done`), checks main CI (15 min), removes expired locks, flags silent agents, checks RAM/disk, runs the
  live smoke (hourly), posts the daily digest.
- Phase change: LEAD sends `phase_done` → the supervisor writes the next phase, sends `phase_start` to everyone, and
  for QA/audit phases builds main once and starts 5 seeded QA servers (one per worker, own DB and port).
- **Approval gate is real, not a prompt rule.** After the RC passes, the supervisor sends `park`: every agent ends
  its session. Nothing runs until the owner runs `run.ps1 -Approve 4.0.0`, which re-checks main = RC sha, CI green,
  version, tag absent, RC report present, then tags, pushes the tag, and verifies the release (workflow, assets,
  GHCR image, APK signing key = v3.1.2's). Agents' permission files also deny `git tag`, tag pushes, `gh release`,
  `gh api` and anything containing `run.ps1` / `-Approve`.
- After the tag: status `waiting_deploy`. The hourly live smoke sees `/healthz` = 4.0.0 → phase p12 starts and the
  heartbeat says so. The owner pastes the prompts once more (docs + final audit).
- **Kill switch**: `run.ps1 -Stop` (creates `C:\Users\Public\lt-team\STOP`). Everyone finishes the current step,
  ends; the supervisor exits. `run.ps1 -Resume`, start the task, paste the prompts again: everyone continues from
  their status files.
- **Hard stops** (STOP file + reason + heartbeat comment): main CI red for 2 h · RC failed 3 times · disk < 10 GB ·
  free RAM < 1 GB for 30 min.
- **Heartbeat issue** "Team loop heartbeat" (label team-loop): daily digest, phase changes, hard stops, "waiting for
  approval", "4.0.0 is live". Comments come from your own account, so GitHub won't push-notify you: open the issue.
- Dead session: no automatic restart (see above). The supervisor flags an agent silent for 2 h to LEAD (LEAD
  re-assigns its tasks) and posts to the heartbeat issue if LEAD itself is silent. You re-paste that prompt.
- Windows Update: set active hours / pause updates for the run. A reboot restarts the supervisor at logon; the
  opencode sessions need re-pasting.

---

## 4. QA phases (phase 1, 4, 6, 11)

### 4a. Roles

| Agent | Owns | Does |
|---|---|---|
| LEAD | coord files, GitHub writes | test plan per round, merge ledgers, triage, dedupe, **checks every S1/S2 itself**, files issues, report |
| EMU | emulator `lt_pixel7`, adb, CDP :9333, QA server :4174 | on-device: app shell, reminders + alarms, offline, resume, font / dark / landscape, widgets |
| WEB-P | QA server :4175 | phone-web slices |
| WEB-D | QA server :4176 | desktop slices + API / security probes (own throwaway local accounts) |
| REPRO | QA server :4177 | reproduces web candidates it didn't find (fresh state, twice). EMU candidates → EMU's repro subagent |
| SKEPTIC | read-only | tries to prove each reproduced finding is NOT a bug (by design per CLAUDE.md, PRD §12, PLAN §7, DESIGN; test-data artefact; emulator-only; duplicate). Confirms only with a cited rule **and** a code cause `path:line` |

Workers rotate slices between rounds. A finder never reproduces or challenges its own finding.

### 4b. The 3 rounds (phase 1 and phase 6)

| Round | Lens (ISO 25010) | Focus |
|---|---|---|
| 1 | Functional suitability | every feature since v3.1.2 end to end (phase 1: Slipped, reschedule / Postpone / Skip + undo, ICS feed, print week, Keep restore, #378/#379. Phase 6: + all M1 and M2 features against BREAKDOWN "done-when" and DESIGN boards). RELEASE-PARITY regression on touched screens |
| 2 | Reliability + Security | offline queue, Back stack, resume, tz / DST, repeats + EXDATE, 2 users sharing (access, private items, backlinks leak), public routes (`/cal/<token>.ics`), imports (ICS, Markdown: huge, malformed, hostile files), data-integrity checks after every destructive step |
| 3 | Interaction capability + Compatibility | 48 dp / 24 px, desktop words on phone, TalkBack labels, keyboard path for every drag, font 130 / 200 %, dark, landscape, empty / error / offline states (DESIGN §3). Gap-fill: the 2 lowest-coverage slices |

Phase 4 = one round (round 1 lens, M1 scope).

### 4c. Pipeline (from QA-LOOP.md)

find → reproduce (another agent, twice, fresh state) → challenge (SKEPTIC) → LEAD triage → file.
- Ledger `findings.json` + one part file per agent (single writer). Evidence files must exist.
- Severity S1–S4 (QA-LOOP.md). Fingerprint `<!-- qa-fp: … -->` on every issue; later rounds search it.
- Max **10 issues per round**, S1 first. Labels `qa-loop`, `v4.0`, `round-<n>`, plus `mobile` / `bug`. Over cap →
  "not filed (cap)" in the report.
- QA agents are read-only: no code edits, commits, pushes, or touching issues the loop didn't open.

### 4d. Machine (16 GB, one PC)

- One build of the commit under test in one disposable worktree. Every QA server runs it with its own DB copy and port.
- `browser.lock` 2 slots (max 2 Playwright browsers), emulator = EMU only, `heavy.lock` = builds, gradle, npm ci.
- Host guard: free RAM ≥ 1.5 GB and disk ≥ 15 GB before a heavy job, else wait.

---

## 5. Build phases (phase 2, 3, 5 and the fixes in 4 and 6)

### 5a. Roles

| Agent | Does |
|---|---|
| LEAD | issues, task plan, hands out tasks, **final** review (REVIEWER note + diff; full read for security-heavy PRs), push, PR, CI watch, merge (migrations too, after §6b-style checks), report. Builds nothing |
| DEV-A, DEV-B, DEV-C | build PRs in own worktrees, own tests green, commit locally (`BUILD-LOOP.md` §4b) |
| REVIEWER | first-pass review of every DEV commit (BUILD-LOOP §5 checklist), re-runs lint + check + unit, numbered changes straight to the DEV (max 2 rounds) |
| TESTER | owns the emulator. Acceptance-tests each reviewed branch on a running build: phone emulator + phone web + desktop, every "done-when" line in BREAKDOWN, the DESIGN board, the listed edge cases. Fail → back to the DEV with evidence |

### 5b. One PR's path (always tested, 4 layers)

1. DEV: unit + targeted e2e (desktop, phone, phone-landscape) green; new tests fail without the change.
2. REVIEWER: checklist + lint / check / unit on the commit.
3. TESTER: hands-on acceptance on a running build.
4. LEAD: final read → push → full CI → merge.

### 5c. Fixes

S1 + S2 all, S3 when small (≤ 1 file, no behaviour question). Branch `fix/v4-qa-<issue>-<slug>`, "Fixes #n", a test
that fails before the fix. Behaviour question → blocker, never a guess.

### 5d. Assignment by chains (files that clash stay with one DEV)

| Phase | DEV-A | DEV-B | DEV-C |
|---|---|---|---|
| 2 fixes | by area (editor / planner / shell) | | |
| 3 M1 | 8 migration 0011 → 10 → 14 → 11 | 9 repeat → 12 digest (after 8) | 13 voice (mobile/) |
| 5 M2 | 15 migration 0012 → **editor chain** 16 → 18 → 19 → 29 | **page chain** 17 → 22 → 31 → 30 → 26 | **DB chain** 23 → 24 → 25, then 20 → 21 → 27 → 28 |

Migration PRs go first in their phase; dependents wait until LEAD merges them.
Security-heavy (LEAD full read): 11 ICS import, 12 digest, 20 backlinks, 27 Markdown import, 30 page reminders.

---

## 6. Before the tag: double and triple checks (phase 6–8)

### 6a. Pre-tag security audit (phase 6)

Scope = `git diff v3.1.2..main` (everything new). Same pipeline as QA (find → prove → challenge → file).
Checklist: access through `level()`/`need()` on every new route and repo function · zod `.strict()` on every input ·
public routes rate-limited · nothing private in URLs, logs, push payloads, ICS · file imports (size caps, parser limits,
no fetching of remote URLs) · attachment refs (cover) not purged / not leaked · Android: new permission (RECORD_AUDIO),
exported components, alarm payloads. Any S1/S2 → fixed before phase 7.

### 6b. Check 1 — automatic release check (`release-check.ps1`, on the release-candidate commit)

- Main CI green on that exact commit.
- Full local suites again: unit · desktop e2e · phone · phone-landscape. Real summary lines saved.
- Fresh production build (`npm run build` + `node build`) boots and `/healthz` shows 4.0.0.
- Migrations 0011 + 0012 on: an empty DB, the seeded QA DB, a **synthetic large DB** (the v3.1.2 seed scaled ×200: thousands of items,
  pages, blocks, reminders, shares). Each run twice. Row counts and ids unchanged, reminder ids / statuses kept,
  `integrity_check` + `foreign_key_check` clean.
- **Upgrade path**: a v3.1.2 build with data → stop → start the RC build on the same DB → data intact, user can log in.
- APK: debug build of the RC installs and launches on the emulator. (A debug APK can't install over the
  release-signed v3.1.2 app, so the real update path is checked after the tag: the 4.0.0 APK must carry the same
  signing key as v3.1.2's.)
- `npm audit --omit=dev` and the lockfile unchanged vs reviewed PRs (no surprise dependency).

### 6c. Check 2 — independent re-run (TESTER, clean worktree)

- TESTER repeats check 1 from scratch in its own fresh worktree (not LEAD's), same commit SHA.
- Plus one regression QA round over the whole app (round 1 lens, all slices, short).
- Results must match check 1. Any difference → investigated, not averaged away.

### 6d. Check 3 — LEAD release checklist → RC report → supervisor stops

- 0 open S1/S2 with label `v4.0` · every BREAKDOWN PR merged or listed as blocked with reason.
- Release notes match the merged PRs (one line per user-visible change, new Android permission named).
- `SERVICE-HANDOFF.md` upgrade section for **v3.1.2 → v4.0.0**: two migrations, `backup.sh` first, rollback =
  `APP_VERSION=3.1.2` **and** `restore.sh` (old version can't read the new schema). New env vars / outbound calls
  (none expected) listed.
- `docs/release/RC-4.0.0.md` = the report for the owner: what's in, checks 1–3 with their summary lines, known
  issues (S3/S4 still open), blockers, upgrade steps. Then `phase-7.done`, supervisor stops.

### 6e. Owner approves (phase 8)

The owner reads `RC-4.0.0.md`, then runs `run.ps1 -Approve 4.0.0`. LEAD then:
- Re-checks main SHA = the RC SHA (anything merged since → back to phase 7).
- Tags `v4.0.0`, pushes the tag. `release.yml` builds image + signed APK + release.
- Post-tag checks: workflow green · image `ghcr.io/chicenwangs/lifetracker:4.0.0` pulls (manifest check) · release
  has `life-tracker-4.0.0.apk` + `deploy-v4.0.0.tar.gz` · the APK's signature matches v3.1.2's (else phones can't
  update) · release notes on the page = the approved ones.
- Reports "ready to deploy" with the exact upgrade steps.

---

## 7. Live site

### 7a. No QA on live, no dummy account

- The live site only runs what the owner deployed. The tag's local production build is the same code.
- Live holds the owner's and partner's real data, backups and push subscriptions. QA creates and deletes hundreds of
  rows, probes access, hits rate limits and Cloudflare.
- No production password on a PC where 6 agents run 24/7.

### 7b. Live smoke (`live-smoke.mjs`, no login, read-only, max once per hour)

`/healthz` up + version · sign-in page, assets, manifest load ·
`/cal/<random>.ics` → 404 · security headers present. A failure → S1 issue labelled `live`.

### 7c. Later, if wanted

Logged-in tests on a live-like server = a staging copy on the homelab (same image, own empty DB). Owner's homelab job,
not in this plan.

---

## 8. After deploy: documentation (phase 10)

Upgrade docs were already written before the tag (6d). Phase 10 = the "now live" pass, one docs PR:
- `CLAUDE.md` "Now", `AGENTS.md` (stack, known issues, tests count), `docs/HANDOFF.md`, `docs/BUILD-NOTES.md`,
  `docs/v2/FEATURES.md`, `docs/v2/PHASES.md`, `README.md`.
- `docs/v2/RELEASE-PARITY.md`: still true for every v1.1.0 feature (checked, not assumed).
- PRD §12: owner decisions from `docs/v4/PLAN.md` §7 + `DESIGN.md` §4 added as D-xx rows.
- Fold all `docs/release/*` fragments, delete them. Mark the build-loop / team docs as history.
- Memory note for future agents: v4.0.0 live, date, what's next (audit issues).

---

## 9. After deploy: full code audit (phase 11)

Same 5 workers, same pipeline, read-only. Scope = the whole codebase, split by area:

| Worker | Area |
|---|---|
| WEB-D | server: routes, repo layer, auth, shares / access, jobs, push, ICS, imports |
| WEB-P | client: components, stores, editor, offline queue, layers / Back |
| EMU | Android shell: Capacitor plugins, Java (alarms, updater, speech), manifest, permissions |
| REPRO | DB: schema, migrations, indexes, query plans on the large synthetic DB, backup / restore scripts |
| SKEPTIC | challenges every finding as usual |

- Lenses: security (OWASP ASVS / MASVS basics) · correctness bugs · data loss risks · performance under the large DB ·
  dead or duplicated code · tests missing on risky code · docs that disagree with code.
- Proof rule: a finding needs a failing test, a reproduced run, or a traced code path with `path:line`. No opinions.
- Output: `docs/audit/AUDIT-4.0.0.md` (ranked) + GitHub issues (label `audit`, max 20, S1 first). **No fixes.**
- Then `phase-11.done`. The supervisor stops for good.

---

## 10. Docs and files (written after approval, all put on main by phase 0)

| File | What |
|---|---|
| `docs/v4/DESIGN.md`, `wireframes/v4/index.html` | written (screens, states, copy; 23 boards) |
| `docs/v4/PLAN.md` §8 | updated: one release v4.0.0, milestones M1 / M2 |
| `qa/TEAM-LOOP.md` | the contract: roles, QA / build / release / audit modes, coord files, locks, host guard |
| `qa/team/run.ps1` | supervisor (phases, restarts, kill switch, approval gate, healthz watch) |
| `qa/team/wait.ps1`, `msg.ps1`, `lock.ps1`, `merge.ps1`, `qa-env.ps1`, `release-check.ps1`, `migration-check.mjs`, `live-smoke.mjs` | helpers (all tested 2026-11-25 in a throwaway root) |
| `qa/team/agents/team-{lead,w1..w5,repro}.md` → copied into each worktree's `.opencode/agents/` | one per slot + a repro subagent |
| `qa/team/opencode.lead.json`, `opencode.w1.json`, `opencode.worker.json` | permissions per slot (W1 alone may use adb) |
| `qa/team/PROMPTS.md` | start command + manual prompts, each with its PowerShell folder command (§11) |
| `CLAUDE.md` / `AGENTS.md` | rule change: "team loop may merge migrations to main; tag only via `run.ps1 -Approve`" |

---

## 11. Starting it

All commands are in `qa/team/PROMPTS.md` (one-time setup, the 6 prompts with their folder commands, stop /
resume / approve / cleanup).

---

## 12. Risks

- **Big-bang deploy**: v3.1.2 → 4.0.0 = two migrations + a lot of new code at once. Mitigated by M1 / M2 checkpoints,
  QA ×3, the upgrade-path check, and the owner's real-data copy test. Rollback = restore the backup.
- **Spend**: Opus 24/7 costs real money. Provider cap; supervisor stops cleanly when refused.
- **DeepSeek quality**: REVIEWER + TESTER + LEAD final read + CI. Nothing merges red.
- **Drift over days**: fresh sessions per phase, state in files, red main blocks merges.
- **One PC**: 6 agents on 16 GB. Locks, host guard, one emulator, max 2 browsers.
- **APK signing**: if the release keystore secret is missing, the release ships without an APK (workflow warns). Post-tag
  check catches it; the owner fixes the secret.
- **Unverified until phase 0 runs**: opencode shell timeout, opencode permission-file format (canary test at start),
  Task Scheduler restart behaviour on this PC.
