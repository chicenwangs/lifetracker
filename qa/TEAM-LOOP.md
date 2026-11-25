TEAM LOOP — SIX AGENTS + SUPERVISOR, CONTINUOUS, UNTIL v4.0.0
Life Tracker · repository https://github.com/chicenwangs/lifetracker · contract version 1 (2026-11-25)

Plan and reasons: qa/TEAM-PLAN.md (v3). This file is the contract every agent follows. It supersedes
qa/BUILD-LOOP.md for this run. It borrows from docs/v3/QA-LOOP.md (5 passes, ledger, filing) and
qa/MOBILE-QA-3.1.2.md (emulator, CDP, patience, host guard) — read those sections when this file points to them.
Role tags: [ALL] · [LEAD] · [W] (every worker) · or the role name ([EMU], [DEV], [REVIEWER], [TESTER] …).
Talk caveman in logs. Issues, PR bodies and reports: plain, factual English.

══════════════════════════════════════════════════════
0. WHO IS WHO [ALL]
══════════════════════════════════════════════════════

Six opencode sessions, started by the owner, each in its own folder, plus a supervisor script (no AI).

| Slot | Folder (= your worktree) | QA mode | build + fix mode | audit mode |
|---|---|---|---|---|
| LEAD (Opus) | C:\Users\Public\lt-team\wt\LEAD | LEAD | LEAD | LEAD |
| W1 | ...\wt\W1 | EMU (owns the emulator) | TESTER (owns the emulator) | AUD-ANDROID |
| W2 | ...\wt\W2 | WEB-P (phone web) | DEV-A (editor chain) | AUD-CLIENT |
| W3 | ...\wt\W3 | WEB-D (desktop + API) | DEV-B (page chain) | AUD-SERVER |
| W4 | ...\wt\W4 | REPRO | DEV-C (DB-views chain) | AUD-DATA |
| W5 | ...\wt\W5 | SKEPTIC | REVIEWER | SKEPTIC |

SUPERVISOR = `run.ps1` (Task Scheduler). It owns the phase, starts QA servers, watches CI, fetches origin every
5 min, removes expired locks, checks the host, runs the hourly live smoke, posts the heartbeat issue, and is the
ONLY thing that can create the release tag (when the owner runs `run.ps1 -Approve`). Agents never run run.ps1.

The phase and its mode come from `C:\Users\Public\lt-team\state\phase.json` (wait.ps1 prints it every time).
Modes: setup · qa · fix · build · audit · rc · tag · docs. Phase list + scope: team.json in bin\.

══════════════════════════════════════════════════════
1. HARD RULES [ALL]
══════════════════════════════════════════════════════

PRODUCT SAFETY
- Never deploy. Never touch planner.jeremyjosh.org (the supervisor's read-only smoke is the only live contact),
  data/app.db (the owner's REAL data), deploy/ (LEAD may edit deploy/.env.example in the RC PR only), .env files,
  .github/workflows/.
- Never create, push or delete tags or releases. Never run run.ps1. Never force-push or rewrite pushed history
  (no rebase, no amend after push, no reset --hard).
- The owner's checkout C:\Users\jeremy josh\Desktop\life-tracker is read-only for everyone. Never edit it.
- Only LEAD pushes branches, opens PRs, creates issues and labels, merges (merge.ps1 only), comments.
- Never `npm ci` / `npm install` / `npx playwright install`: node_modules is a junction shared by every worktree
  AND the owner's checkout. A dependency change = blocker.
- Every DB you create lives under C:\Users\Public\lt-team\ (qa\, runs\). Test accounts are local only.

CODE (CLAUDE.md wins on details)
- Svelte 5 runes, SvelteKit 2, better-sqlite3, Drizzle forward-only migrations, zod .strict(). No new dependency.
- Repo layer owns SQL; routes never build SQL; never trust client ids; access = level()/need().
- Item date/time owner-local; blocks + *_at UTC; never new Date('YYYY-MM-DD').
- Every mutation gets an undo entry (named exceptions: confirm dialogs, like Rotate/Turn off feed).
- Every drag has a click/keyboard path. Desktop ≥ 24 px, phone ≥ 48 dp. No "Click"/"Ctrl"/"Esc" on phone.
  Back closes the top layer (use:backCloses). invalidateAll only via $lib/client/refresh.
- Smallest complete change. Stage by path (`git add <paths>`), never `git add -A` / `.` (the worktree has an
  untracked .opencode/ that must never be committed).
- Feature PRs don't edit AGENTS.md, CLAUDE.md, HANDOFF.md, BUILD-NOTES.md, FEATURES.md, PHASES.md. Each PR adds one
  fragment docs/release/v4.0/PR-<n>.md (what changed for the user · files · tests · doc lines to change). LEAD
  folds fragments in the RC and docs phases.

HONESTY
- Never claim a test passed that you did not run. Paste the real summary line ("28 passed (1.4m)").
- Never weaken, delete, .skip or .only a test to get green.
- Never invent UI text, code or evidence. A finding without an evidence file that exists = no finding.
- Unsure about behaviour → blocker (§10). Decisions live in docs/v4/PLAN.md §7, docs/v4/DESIGN.md (incl. §4
  defaults), docs/v4/BREAKDOWN.md, docs/v2/PRD.md §12. Not there = not yours to decide.

══════════════════════════════════════════════════════
2. COMMANDS [ALL]
══════════════════════════════════════════════════════

`PS x.ps1 …` below means: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Public\lt-team\bin\x.ps1 …`
Node scripts: `node C:\Users\Public\lt-team\bin\<name>.mjs …`

| Command | Who | What |
|---|---|---|
| `PS wait.ps1 -Agent <slot>` | all | blocks up to 240 s; prints the phase line + new messages/events for you, or TIMEOUT. Costs nothing while blocked |
| `PS wait.ps1 -Agent <slot> -Replay 30` | all | reprint your last 30 messages (after a restart) |
| `PS msg.ps1 -From <slot> -To <slot/ALL/SUPERVISOR> -Type <type> [-Pr n] [-Issue n] [-Branch b] [-Commit sha] [-Tests "…"] [-Text "…"] [-Items a,b] [-Phase id] [-Result pass/fail] [-File path]` | all | send one message (§4) |
| `PS lock.ps1 -Agent <slot> -Take heavy` / `-Release heavy` / `-Renew heavy` / `-List` | all | locks (§3) |
| `PS qa-env.ps1 -Status` | all | QA servers: commit, ports, logins |
| `PS qa-env.ps1 -Serve -Agent <slot>` / `-Unserve -Agent <slot>` | all | build YOUR worktree, serve it on your port+1 with a fresh seeded DB |
| `PS qa-env.ps1 -Emulator -Port <p> [-From <worktree>] -Agent W1` | W1 | boot lt_pixel7, build + install the debug APK pointed at http://localhost:<p> |
| `PS merge.ps1 -Pr n` | LEAD | the only way to merge (gates: CI green, mergeable, migration check) |
| `PS release-check.ps1 -Agent <slot> -Sha <sha> [-Apk]` | LEAD, W1 | release checks 1 and 2 (§9) |
| `node …\migration-check.mjs --app <wt>\app --old C:\Users\Public\lt-team\wt\V312\app --out <dir> [--pr n --sha <head>]` | LEAD | migration safety check (§7f) |

Ports (never 4173 or 5173): your E2E_PORT = team.json slots.<you>.port (LEAD 4191, W1 4181, W2 4183, W3 4185,
W4 4187, W5 4189); your serve port = that + 1. QA servers: W1 4174, W2 4175, W3 4176, W4 4177, W5 4178 (one per
worker, own seeded DB, login in C:\Users\Public\lt-team\qa\<slot>\TEST-LOGIN.txt). In e2e:
`$env:E2E_PORT=<yours>; npx playwright test <specs> --project=desktop --project=phone --project=phone-landscape`.

══════════════════════════════════════════════════════
3. SHARED RESOURCES [ALL]
══════════════════════════════════════════════════════

- heavy (1 at a time, RAM ≥ 1.5 GB and disk ≥ 15 GB enforced): any `npm run build`, e2e, vite dev, gradle,
  qa-env -Serve/-Emulator/-Up. lint, check and unit tests are light (no lock).
- browser (2 slots): any Playwright browser you drive by hand (not e2e: e2e is under heavy).
- emulator (1): W1 only. git (1): the supervisor and merge.ps1 only.
- Take → do the job → release right away, also on failure. Long job: `-Renew` before expiry (heavy 60 min,
  browser 120, emulator 240). Expired locks are removed by the supervisor and anyone may take them.
- Never wait for one lock while holding another. TIMEOUT on a lock = tell LEAD (msg type note) and do light work.

══════════════════════════════════════════════════════
4. MESSAGES [ALL]
══════════════════════════════════════════════════════

Every agent writes only its own file coord\<slot>.out.jsonl (through msg.ps1). The supervisor writes
coord\events.jsonl. LEAD sees all worker messages; a worker sees messages to it or ALL.

| Type | From → To | Meaning (fields) |
|---|---|---|
| start | LEAD → W | do this task (pr/issue, branch, text = what, file = spec or slice file) |
| changes | LEAD/REVIEWER/TESTER → DEV | fix these (items = numbered list with file:line), same branch, new commit |
| ready_for_review | DEV → W5 | commit ready (branch, commit, tests = 4 summary lines) |
| review_pass / review_changes | W5 → W1 / DEV | first-pass review result (items) |
| accept_pass / accept_fail | W1 → LEAD / DEV | acceptance test result (items, file = evidence folder) |
| scout / repro / challenge | LEAD → W | QA work (file = round plan or part file, items = finding ids) |
| candidates / reproduced / challenged | W → LEAD | QA results (file = part file, items = ids + verdict) |
| audit_findings | W → LEAD | audit results (file = part file) |
| merged | LEAD (merge.ps1) → ALL | PR merged (commit) — DEVs on later tasks merge origin/main if their PR conflicts |
| blocker | any → LEAD | cannot continue without a decision (text) |
| note | any → any | information, no action needed |
| done | W → LEAD | all my tasks finished, nothing queued |
| watch_ci / qa_env / qa_env_down / heartbeat | LEAD → SUPERVISOR | watch this PR's CI · build QA servers at commit (or main) · stop them · post text to the heartbeat issue |
| phase_done | LEAD → SUPERVISOR | phase finished (phase = id, result pass/fail for rc, commit = RC sha for rc, text = summary) |
| phase_start, qa_env_ready, qa_env_failed, ci_done, main_red, stale_agent, lock_expired, park, stop, resume | SUPERVISOR events | as named |

══════════════════════════════════════════════════════
5. THE LOOP EVERY AGENT RUNS [ALL]
══════════════════════════════════════════════════════

Start / restart:
1. `cd` must be your worktree (C:\Users\Public\lt-team\wt\<slot>). If not → say so in one line and stop.
2. Read this file fully, CLAUDE.md in your worktree, and your status file coord\<slot>.status.json if it exists.
3. `PS wait.ps1 -Agent <slot> -Replay 30` to see recent messages. Carry on from your status: never redo a
   finished task, never re-create issues, branches or PRs that exist.

Then forever:
1. `PS wait.ps1 -Agent <slot>`. TIMEOUT → call it again (that's all; no other polling).
2. Handle every message it printed, in order. Long work (a build, a scout slice) is fine: messages wait for you.
3. Write coord\<slot>.status.json (your file only): {"slot","role","phase","task","step","updated","next"}.
   Update it at every step change so a restart can continue.
4. Back to 1.

Special events:
- phase_start → re-read this file's section for the new mode. Drop tasks of the old phase unless LEAD restarts them.
- park → finish your current step (never leave a lock or a half-commit), write status "parked", end your session.
- stop → same as park, status "stopped". A STOP line from wait.ps1 means the same.
- Phase status waiting_approval or waiting_deploy → nothing to do: keep calling wait.ps1 (or end if parked).
- After any context compaction: re-read this file before the next action.

══════════════════════════════════════════════════════
6. PHASE p00 — SETUP [LEAD]
══════════════════════════════════════════════════════

Workers wait. LEAD:
1. In wt\LEAD: `git switch -c chore/team-loop-setup origin/main`.
2. Copy these NEW files from the owner's checkout C:\Users\jeremy josh\Desktop\life-tracker (read-only source;
   use Copy-Item, never edit there) into the same paths in your worktree: qa/TEAM-LOOP.md · qa/TEAM-PLAN.md ·
   qa/team/ (the whole folder) · docs/v4/DESIGN.md · wireframes/v4/index.html.
   Do NOT copy CLAUDE.md, AGENTS.md or docs/v4/PLAN.md: the owner's checkout is older than main.
   Instead apply the exact lines in qa/team/rule-lines.md to the origin/main versions in your worktree.
   `git status` must show only these 8 paths (5 new, 3 edited). Stage by path (`git add qa/team` is fine).
3. Commit, push, PR "chore: team loop setup (contract, supervisor, v4 design)", label team-loop.
   `msg.ps1 -Type watch_ci`. ci_done pass → `PS merge.ps1 -Pr n`. Fail → read the log, fix, push, again.
4. Labels once: v4.0, qa-loop, round-1, round-2, round-3, audit, audit-pre, blocked (gh label create, skip existing).
5. `msg.ps1 -From LEAD -To SUPERVISOR -Type phase_done -Phase p00-setup -Text "<PR link>"`.

══════════════════════════════════════════════════════
7. BUILD AND FIX MODE (p02, p03, p05, p06, p09)
══════════════════════════════════════════════════════

7a. [LEAD] TASK BOARD
- Build phases: one GitHub issue per BREAKDOWN PR of the milestone (title "v4.0 PR <n>: <title>", body = the
  BREAKDOWN section + the DESIGN board ids + "Built by the team loop.", labels v4.0, team-loop). Skip existing.
- Fix phases: tasks = open issues filed by this loop (label qa-loop or audit-pre) with severity S1 or S2, plus S3
  that are ≤ 1 file and need no behaviour decision. S1 first. RC-failure items come first in p09.
- coord\plan.json (you are its only writer): tasks [{id, kind, issue, pr, title, owner, needs, branch, state,
  rounds, notes}], state = queued | building | review | accept | final | ci | merged | blocked.
- Chains (files that clash stay with one DEV):
  - M1: W2 (DEV-A) 8 migration 0011 → 10 → 14 → 11 · W3 (DEV-B) 9 → 12 (12 after 8) · W4 (DEV-C) 13 (voice, mobile/).
  - M2: W2 15 migration 0012 → 16 → 18 → 19 → 29 (editor chain) · W3 17 → 22 → 31 → 30 → 26 (page chain) ·
    W4 23 → 24 → 25 → 20 → 21 → 27 → 28 (DB views, then links + Markdown).
  - Fixes: by area (W2 editor/pages, W3 planner/settings/server, W4 Keep/shell/DB), balance the counts.
- A task starts only when its `needs` are merged (migrations first). Each DEV: max 1 building + 1 in review/accept.
- Branches: feat/v4-pr<n>-<slug> · fix/v4-qa-<issue>-<slug>. Send `start` with branch, issue, and text = the
  BREAKDOWN section heading.

7b. [DEV] BUILD ONE TASK
1. `git switch -c <branch> origin/main` (the supervisor fetches every 5 min; you never fetch).
2. Read the spec: BREAKDOWN section (or the issue), DESIGN.md section + board ids (wireframes/v4/index.html),
   CLAUDE.md rules, every file you will touch, and the callers of every function you change.
3. Write a 5-line plan into C:\Users\Public\lt-team\logs\<slot>\task-<id>.md before coding.
4. Build it. Add the tests the spec lists; new behaviour needs a test that fails without the change. Add the
   fragment docs/release/v4.0/PR-<n>.md (fix tasks: fix-<issue>.md).
5. In app\: `npm run lint` · `npm run check` · `npm run test:unit` (light), then targeted e2e under heavy lock:
   `$env:E2E_PORT=<yours>; npx playwright test <your specs + specs of screens you touched> --project=desktop
   --project=phone --project=phone-landscape`. All green → commit:
   "<type>(<area>): <what> (#<issue>)" + blank line + "Co-Authored-By: DeepSeek (opencode) <noreply@opencode.ai>".
6. `msg.ps1 -From <you> -To W5 -Type ready_for_review -Issue n -Branch b -Commit sha -Tests "lint … | check … |
   unit … | e2e …"`. Update status. Start your next started task while waiting.
7. changes / review_changes / accept_fail → fix on the same branch, new commit (never amend), report again.
   If your PR conflicts after a `merged`: `git merge origin/main`, resolve, test again, new commit.
8. Migration tasks (PR 8, 15): `npm run db:generate` after editing schema.ts; never edit an old migration; ADD
   COLUMN only for 0011; 0012 rebuilds reminders in one transaction keeping ids (BREAKDOWN). Run the migration
   unit tests. Tell LEAD in the text that it is a migration PR.

7c. [REVIEWER] FIRST-PASS REVIEW (W5)
1. In wt\W5: `git switch --detach <commit>`. Read the diff (`git diff origin/main...<commit>`) AND the code it
   touches. Run lint + check + unit yourself (light).
2. Checklist: (1) does all of the spec, nothing extra, PLAN §7 + DESIGN respected · (2) CLAUDE.md code + phone
   rules, undo entry per mutation · (3) security: level()/need() or owner scoping in the repo layer, zod .strict()
   on every new input, public routes rate-limited, nothing private in URLs/logs/push/ICS · (4) dates owner-local vs
   UTC, no new Date('YYYY-MM-DD') · (5) tests fail without the change, none weakened · (6) phone + desktop, 48 dp,
   no desktop words on phone · (7) only intended files (no .opencode, no lockfile churn, no debug leftovers) ·
   (8) fragment present and true.
3. Clean → `review_pass` To W1 (branch, commit, text = what to accept-test, items = risky spots).
   Not clean → `review_changes` To the DEV, items numbered with file:line and the fix expected. After 2 rounds on
   one task → send it to LEAD (type note, text "2 review rounds: …") and LEAD decides.

7d. [TESTER] ACCEPTANCE (W1)
1. In wt\W1: `git switch --detach <commit>`. `PS qa-env.ps1 -Serve -Agent W1` (your build, fresh seeded DB).
2. Check every "Done when" / behaviour line of the BREAKDOWN section and the DESIGN board on that server: phone
   layout (Playwright phone context, browser lock) and desktop. If the change touches mobile/ or Android
   behaviour: `PS qa-env.ps1 -Emulator -Port <your port+1> -From C:\Users\Public\lt-team\wt\W1 -Agent W1` and test
   on the emulator (CDP recipe: docs/v3/QA-LOOP.md "Emulator CDP").
3. Try the edge cases the spec lists + undo + empty/error states (DESIGN §3). Evidence (screenshots, DOM text)
   in C:\Users\Public\lt-team\runs\<phase>\accept\<task>\.
4. Pass → `accept_pass` To LEAD (commit, file = evidence folder, text = what you checked). Fail → `accept_fail`
   To the DEV (items: steps → expected → actual + evidence path). `PS qa-env.ps1 -Unserve -Agent W1` after.

7e. [LEAD] FINAL REVIEW, PUSH, CI, MERGE
1. On accept_pass: read the REVIEWER and TESTER notes and the diff. Full read (not diff only) for security-heavy
   PRs: 11 ICS import, 12 digest, 20 backlinks, 27 Markdown import, 30 page reminders, any fix touching auth,
   shares, public routes or imports.
2. Not clean → `changes` To the DEV. Clean → `git push origin <branch>` (from wt\LEAD; branches are shared),
   `gh pr create --base main --head <branch> --title "<issue title>" --label v4.0 --label team-loop` with body:
   "Fixes #<issue>" · what changed · tests (summary lines) · review + acceptance rounds · "Built by the team loop
   (opencode: DeepSeek workers, Opus lead)." Then `msg.ps1 -To SUPERVISOR -Type watch_ci -Pr n`.
3. ci_done pass → `PS merge.ps1 -Pr n` → state merged → start dependents. ci_done fail → read the failing job log
   (`gh run view <id> --log-failed`); flaky (passes on one re-run: `gh run rerun <id> --failed`) → re-run once;
   real → `changes` To the DEV with the failing test + error lines.
4. main_red event → nothing merges until main is green; find the cause, task the fix first.

7f. [LEAD] MIGRATION PRs (8, 15)
Before merging: in wt\LEAD `git switch --detach <PR head sha>`, take heavy lock, run
`node C:\Users\Public\lt-team\bin\migration-check.mjs --app C:\Users\Public\lt-team\wt\LEAD\app --old
C:\Users\Public\lt-team\wt\V312\app --out C:\Users\Public\lt-team\runs\migrations\pr-<n> --pr <n> --sha <head sha>`.
It must print MIGRATION CHECK PASSED (empty DB twice · v3.1.2-seeded DB scaled ×200 → new migrations with
counts and ids unchanged · new seed). merge.ps1 refuses a migration PR without it. Put the check's summary in
the PR body.

7g. [LEAD] END OF A BUILD/FIX PHASE
All tasks merged or blocked (blockers.md, issue labelled blocked) → p03/p06: a short note in report.md → phase_done.

══════════════════════════════════════════════════════
8. QA MODE (p01: 3 rounds · p04: 1 round · p07: 3 rounds)
══════════════════════════════════════════════════════

Framework, ledger fields, severities, evidence rules and filing format: docs/v3/QA-LOOP.md (read it). Emulator
handling, patience, CDP, dialogs: qa/MOBILE-QA-3.1.2.md §4, §5, §9. QA servers are built by the supervisor at
phase start (qa_env_ready event: commit + ports). Read only for everyone: no code edits, commits, pushes.

8a. [LEAD] EACH ROUND
1. Round folder C:\Users\Public\lt-team\runs\<phase>\round-<n>\ with plan.json, parts\, shots\, ui\,
   findings.json (you are its only writer), report.md.
2. Lens per round (ISO 25010): round 1 functional suitability · round 2 reliability + security · round 3
   interaction capability + compatibility (+ the 2 slices with the lowest coverage so far). p04 = round-1 lens on
   M1 features + touched screens.
3. Slices (rotate W2/W3 between rounds; W1 always the device):
   - W1 EMU (device): app shell (tab bar, Back stack, resume, system bars), reminders + notification actions +
     exact alarms (+ daily digest, page to-do reminders when built), offline queue, font 130/200 %, dark,
     landscape, widgets, voice note (when built).
   - W2 WEB-P (phone web): Today, Calendar (week, month, agenda), add sheet + quick add grammar, Keep, Pages
     (editor, `[[`, blocks, DB views when built), Settings, search.
   - W3 WEB-D (desktop + API): planner (week, day, Slipped, reschedule/Postpone/Skip, print), Pages + DB views,
     Settings (types, import, calendar feed, notifications), 2 users sharing (create a 2nd local account),
     API/security probes against your QA server only (access across users, zod strictness, public routes
     `/cal/<token>.ics`, imports with huge/malformed/hostile files, rate limits).
   - What changed since v3.1.2: `git log --oneline v3.1.2..<qa commit>` and docs/release/v4.0/*.md fragments.
4. `scout` To W1, W2, W3 with file = plan.json and text = their slice + lens + stop time (≈ 100 min).
5. Route as results arrive (don't wait for the end): W2/W3 candidates → `repro` To W4 (batches ≤ 6). W1
   candidates → W1 reproduces them with the team-repro SUBAGENT (fresh context) itself. Reproduced →
   `challenge` To W5 (batches ≤ 8).
6. Triage confirmed findings: merge same-cause duplicates; `gh issue list --state all --search "<keywords>"` and
   search the fingerprint `qa-fp:`; severity S1–S4; **you check every S1/S2 yourself** (evidence file + code cause).
7. File max 10 per round, S1 first: title "<Area>: <what is wrong> (<screen>)", labels qa-loop, v4.0, round-<n>,
   bug (+ mobile for phone). Body: steps · expected (rule + source) · actual · evidence file names (in
   C:\Users\Public\lt-team\runs\…) · cause path:line · 25010 quality · severity · "Found by the team loop;
   reproduced twice; challenged." · last line `<!-- qa-fp: <slice>|<cause path:line>|<short title> -->`.
   Over the cap → "not filed (cap)" in report.md.
8. report.md per round: counts per pass (found / reproduced / confirmed / rejected + reasons), filed table.
9. After the last round → phase_done (text = issue numbers by severity).

8b. [EMU] / [WEB-P] / [WEB-D] SCOUT
- Walk your slice on your QA server (and the emulator for W1: `PS qa-env.ps1 -Emulator -Port 4174 -Agent W1`
  once per phase, emulator lock held for the round) and run the Playwright specs of your slice
  (`$env:E2E_PORT=<yours>` under heavy lock).
- Max 12 candidates per slice, best first. Each: id F-<phase>-r<n>-<slot>-<nn>, slice, quality, rule (+ source),
  steps, expected, actual, evidence (files that exist), status candidate. Write only your part file
  parts\<slot>.json. Send `candidates` To LEAD in batches of ≤ 4 as you go (items = ids).
- Leave the emulator as found: font 1.0, light/dark back, wifi + data on.

8c. [REPRO] REPRODUCE (W4, and W1's team-repro subagent)
For each id: clean state (new browser context + fresh login; emulator: force-stop + relaunch), follow the steps
exactly, twice. Both show it + new evidence (<id>-r1/-r2) = reproduced; else rejected with a one-line reason.
Never fix the steps. Results → parts\repro-<slot>.json, `reproduced` To LEAD (items = id:verdict).

8d. [SKEPTIC] CHALLENGE (W5)
Try to prove each finding is NOT a bug: by design (CLAUDE.md, PRD §12, PLAN §7, DESIGN.md, release fragments)?
test-data artefact? flaky timing? emulator-only (haptics, notification drawer, real keyboard, cut-outs)?
duplicate of an open issue? Desktop finding → check desktop didn't change by design. Confirm ONLY with a cited
rule AND a code cause path:line after reading that file. Results → parts\skeptic.json, `challenged` To LEAD.

══════════════════════════════════════════════════════
9. RELEASE CANDIDATE (p10-rc) — checks 1, 2, 3
══════════════════════════════════════════════════════

[LEAD]
1. Branch chore/release-4.0.0: app/package.json + app/package-lock.json version 4.0.0 · deploy/.env.example
   APP_VERSION · docs/v2/RELEASE-NOTES.md "4.0.0" section (one line per user-visible change from the fragments;
   name the new Android RECORD_AUDIO permission; list known open S3/S4) · docs/SERVICE-HANDOFF.md upgrade section
   "v3.1.2 → v4.0.0": two migrations (0011, 0012), backup.sh first, try the image on a COPY of the real DB first,
   APP_VERSION=4.0.0 pull + up, rollback = APP_VERSION=3.1.2 AND restore.sh (3.1.2 can't read the new schema),
   new env / outbound calls (none expected; say so). Same shape as the 3.1.2 release commit (c491826).
   W5 reviews it (ready_for_review To W5 from LEAD is allowed here). CI → merge.ps1. RC sha = the merge commit.
2. `msg.ps1 -To SUPERVISOR -Type qa_env -Commit <RC sha>` → wait for qa_env_ready.
3. Check 1: `PS release-check.ps1 -Agent LEAD -Sha <RC sha>` → runs\release\LEAD-<sha7>\summary.md.
4. Check 2 (parallel): `start` To W1: `PS release-check.ps1 -Agent W1 -Sha <RC sha> -Apk` in its own worktree +
   compare with check 1 (any difference investigated, not averaged). `scout` To W2, W3, W4: one regression round,
   round-1 lens, all slices split, 60 min → repro/challenge as in §8 (W5 skeptic).
5. Check 3, your checklist: both release checks PASS on the same sha · 0 open S1/S2 labelled v4.0 · every
   BREAKDOWN PR merged or listed blocked with reason · release notes match merged PRs · SERVICE-HANDOFF upgrade
   section present · main == RC sha (nothing merged since).
6. Write C:\Users\Public\lt-team\RC-4.0.0.md (NOT in the repo: a repo change would move main):
   RC sha · what's in (PR list) · check 1 + check 2 summary tables (paste summary.md) · regression round result ·
   open issues S3/S4 · blockers · migration check numbers · upgrade steps · rollback.
7. All pass → `msg.ps1 -To SUPERVISOR -Type phase_done -Phase p10-rc -Result pass -Commit <RC sha>`. The supervisor
   parks everyone; the owner approves. Anything failed → file issues for it, `-Result fail -Text "<why>"`: the
   supervisor goes back to p09-fix (max 3 RC attempts, then it stops for the owner).
[W1] check 2 as above; report `note` To LEAD with the summary.md path and PASS/FAIL.

══════════════════════════════════════════════════════
10. BLOCKERS [ALL]
══════════════════════════════════════════════════════

- Worker: spec gap, open decision, dependency needed, failing test you can't explain in 30 min → `blocker` To
  LEAD and continue with other work.
- LEAD: decide only if PLAN §7 / DESIGN / BREAKDOWN / PRD §12 clearly answers it (cite it in the reply).
  Otherwise append to C:\Users\Public\lt-team\blockers.md: "## <task> — <question>" + options + your default,
  label the issue blocked, mark the task blocked, move on. Never stop the line for one task.
- The owner may answer in blockers.md ("Answer: …") at any time: LEAD re-reads it at every phase_start.

══════════════════════════════════════════════════════
11. AUDIT MODE (p08: pre-tag security · p13: full code audit)
══════════════════════════════════════════════════════

Read only. QA servers are up (qa_env_ready) for proving findings.
- Areas: W1 AUD-ANDROID (mobile/: Capacitor plugins, Java alarms/updater/speech, manifest, permissions, exported
  components) · W2 AUD-CLIENT (components, stores, editor, offline queue, layers/Back, XSS in rendered content) ·
  W3 AUD-SERVER (routes, repo layer, auth, sessions, shares/level(), jobs, push, ICS feed + import, Markdown
  import, rate limits, headers) · W4 AUD-DATA (schema, migrations, indexes, query plans on the large DB from
  migration-check, backup/restore scripts, attachments + refs) · W5 SKEPTIC challenges every finding.
- p08 scope = `git diff v3.1.2..<qa commit>` only, security lens: access control, input validation, injection,
  secrets/private data in URLs/logs/payloads, file import limits, Android permissions/exports.
- p13 scope = whole codebase, lenses: security (OWASP ASVS / MASVS basics) · correctness · data-loss risk ·
  performance on the large DB · dead/duplicated code · risky code without tests · docs that disagree with code.
- Proof rule: a failing test (in your runs folder, not committed), a reproduced run against your QA server, or a
  traced code path with path:line. No opinions, no "could be".
- Results → runs\<phase>\parts\<slot>.json, `audit_findings` To LEAD. W5 challenges (`challenge` from LEAD).
- [LEAD] p08: file confirmed S1–S3 (label audit-pre, v4.0, bug) → fixed in p09. p13: write docs/audit/AUDIT-4.0.0.md
  (ranked table + method), PR it (W5 reviews), file max 20 issues (label audit), no fixes. Then phase_done.

══════════════════════════════════════════════════════
12. DOCS MODE (p12, after the owner deployed 4.0.0)
══════════════════════════════════════════════════════

Phase status waiting_deploy = do nothing (keep waiting). When it runs: [LEAD] one PR docs/v4.0-live:
CLAUDE.md "Now" (live = v4.0.0, date, tests count, what's next = audit issues) · AGENTS.md (stack, known issues,
tests) · docs/HANDOFF.md · docs/BUILD-NOTES.md · docs/v2/FEATURES.md · docs/v2/PHASES.md row · README.md ·
docs/v2/RELEASE-PARITY.md re-checked line by line (say how) · PRD §12: PLAN §7 + DESIGN §4 decisions as D-xx rows ·
fold every docs/release/v4.0/*.md fragment, then delete them.
W5 reviews (doc vs code: code wins, fix the doc). CI → merge.ps1 → phase_done.

══════════════════════════════════════════════════════
13. REPORTS [LEAD]
══════════════════════════════════════════════════════

- C:\Users\Public\lt-team\report.md: append per phase: dates, tasks (merged / blocked), issues filed, CI runs,
  incidents, decisions you made (with the doc that answered them). A 3-line daily digest at the first wake after
  08:00 (also `msg.ps1 -To SUPERVISOR -Type heartbeat -Text "<digest>"`).
- Never paste secrets, test passwords or private data into reports, issues or PRs.

══════════════════════════════════════════════════════
14. WHEN THINGS GO WRONG [ALL]
══════════════════════════════════════════════════════

- A command hangs > 20 min with no output → stop it, record it, try once more, then blocker.
- Server stale (clicks do nothing, healthz fails) → it's the server, not the app: qa_env again (LEAD) or -Serve again.
- Emulator stuck → qa/MOBILE-QA-3.1.2.md §5a/§5b recovery. Never wipe the AVD.
- Lock TIMEOUT → note to LEAD, do light work, try later.
- Your opencode session restarted → §5 "Start / restart". Your status file + -Replay tell you where you were.
- stale_agent event (LEAD) → that worker may be dead: its tasks stay assigned 30 more min, then re-assign them to
  another worker of the same mode and note it in report.md. The owner re-pastes its prompt when they see it.
