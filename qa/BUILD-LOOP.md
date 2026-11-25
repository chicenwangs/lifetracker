OVERNIGHT BUILD LOOP — THREE AGENTS
Life Tracker — builds one release from docs/v4/PLAN.md + docs/v4/BREAKDOWN.md

Repository: https://github.com/chicenwangs/lifetracker
Prompt version 1 (2026-11-25). Same shape as qa/MOBILE-QA-3.1.2.md (roles, coord files, locks, host guard),
but agents WRITE code here. Read this whole file. Then follow the parts tagged for your role.
Role tags: [ALL] · [LEAD] · [DEV] (= DEV-A and DEV-B).

══════════════════════════════════════════════════════
0. MISSION AND TEAM [ALL]
══════════════════════════════════════════════════════

Build every PR of ONE release (the owner names it in the launch prompt: RELEASE=v3.2 | v3.3 | v4.0), each as
one issue → one branch → one PR into main, reviewed and merged, CI green. Quality beats count: 4 clean merged PRs
beat 7 half-done ones.

| Agent | Runs in | Does |
|---|---|---|
| LEAD | Claude Code | preflight, worktrees, issues, task plan, reviews every DEV diff, pushes branches, opens PRs, watches CI, merges, builds its own assigned PRs, writes the release docs PR, morning report |
| DEV-A | opencode (DeepSeek) | builds the PRs LEAD assigns, in its own worktree, commits locally. Never pushes. |
| DEV-B | opencode (DeepSeek) | same as DEV-A |

The author of a PR never reviews it. LEAD reviews DEV work. LEAD's own PRs get a review subagent (fresh context,
Claude) before push.

Talk caveman in logs. PR bodies and issues: plain, factual English.

══════════════════════════════════════════════════════
1. READ FIRST [ALL]
══════════════════════════════════════════════════════

- CLAUDE.md (Code rules, Phone rules, Done per phase) and AGENTS.md (Stack, Known issues, Testing recipe).
- docs/v4/PLAN.md: §7 owner decisions (they win), §8 work split for your RELEASE.
- docs/v4/BREAKDOWN.md: the section for each PR you build. This is your spec.
- docs/v2/PRD.md §12 (D-xx) when a behaviour question comes up. Never guess an open decision → blocker (§6).
- Before editing a file: read it, and grep the callers of every function you change.

══════════════════════════════════════════════════════
2. HARD RULES [ALL]
══════════════════════════════════════════════════════

PRODUCT SAFETY
- Never deploy. Never touch planner.jeremyjosh.org, data/app.db (the owner's REAL data), deploy/, .env files.
- Never create tags or releases, never run gh release, never edit .github/workflows/.
- Never push to main, never force-push, never rewrite history of a pushed branch.
- Only LEAD pushes branches, opens PRs, merges, creates issues. DEVs never run git push or gh (write).
- Never merge a PR with a migration (app/drizzle/*.sql added): LEAD opens it and leaves it for the owner.
- The repo checkout C:\Users\jeremy josh\Desktop\life-tracker is the owner's. Nobody edits files there.
  All work happens in worktrees under C:\Users\Public\lt-build\<RUN_ID>\ (no space in the path).

CODE
- Stack is fixed: Svelte 5 runes, SvelteKit 2, better-sqlite3, Drizzle, zod .strict(). No new dependency
  (if one seems needed → blocker).
- Repo layer owns SQL. Routes never build SQL. Never trust client ids. Access check = level()/need().
- Item date/time = owner-local. Never new Date('YYYY-MM-DD').
- Every mutation gets an undo entry. Every drag has a click/keyboard path. Phone ≥ 48 dp, desktop ≥ 24 px.
- Phone copy: no "Click", "Ctrl", "Esc", "PC view". Back closes the top layer (use:backCloses).
- invalidateAll only via $lib/client/refresh.
- Smallest complete change. No speculative options, no refactors outside the PR's scope.
- Stage files by path (git add <paths>). Never git add -A / git add . (the worktree has a local
  .opencode/opencode.json that must never be committed).

DOCS
- Don't edit AGENTS.md, CLAUDE.md, HANDOFF.md, BUILD-NOTES.md, FEATURES.md, PHASES.md in feature PRs (parallel
  PRs would conflict). Instead each PR adds ONE fragment: docs/release/<RELEASE>/PR-<n>.md
  (what changed for the user · files · tests · any doc line that must change). LEAD folds the fragments into
  the real docs in the release docs PR (§5f).

HONESTY
- Never claim a test passed that you didn't run. Paste the summary line (e.g. "28 passed").
- Never weaken or delete an existing test to get green. Never add .skip/.only.

══════════════════════════════════════════════════════
3. COORDINATION CONTRACT [ALL]
══════════════════════════════════════════════════════

3a. RUN ID AND FOLDERS
- The owner gives every agent the same RUN_ID and RELEASE. Missing → stop and say so.
- Run root: C:\Users\Public\lt-build\<RUN_ID>\
    coord\             shared files (single writer each, §3c)
    coord\locks\       lock files (§3d)
    PROMPT.md          copy of this file (LEAD)
    LEAD\ DEV-A\ DEV-B\  each agent: its worktree wt\ + logs\
    report.md          morning report (LEAD)
- Worktree per agent: <run>\<AGENT>\wt (LEAD creates all three in preflight).

3b. OWNERSHIP AND PORTS
| Resource | Owner |
|---|---|
| GitHub writes (issue create, push, pr create/merge, label) | LEAD |
| git fetch, git worktree add/remove/prune | LEAD, holding git.lock |
| branch switch / commit inside a worktree | that worktree's agent |
| emulator lt_pixel7 + adb | LEAD only, only for PRs that change mobile/ (none in v3.2) |
| coord\plan.json, coord\LEAD.*.jsonl, coord\ready.json | LEAD |
| coord\<DEV>.status.json, coord\<DEV>.out.jsonl | that DEV |

| Agent | E2E_PORT | dev server (if needed) |
|---|---|---|
| LEAD | 4185 | 4186 |
| DEV-A | 4181 | 4182 |
| DEV-B | 4183 | 4184 |
Never run anything on 4173–4176 or 5173 (owner / QA ports). Dev servers use a throwaway DB copy inside your
own folder (copy data/qa/app.db → <run>\<AGENT>\app.db), never data/app.db. Prefer e2e (temp DB) over a dev server.

3c. COORDINATION FILES (atomic: write <name>.tmp, rename; JSONL = append whole lines)
- coord\ready.json (LEAD): RUN_ID, RELEASE, start, budget hours, base commit, "go": true.
- coord\plan.json (LEAD): tasks [{pr, issue, title, owner, needs:[pr], branch, state}] where state =
  queued | building | review | changes | pushed | ci | merged | blocked. LEAD is the only writer.
- coord\<DEV>.out.jsonl (DEV → LEAD): {"type":"ready_for_review"|"blocker"|"note"|"done", "pr", "branch",
  "commit", "tests":{"lint":"…","check":"…","unit":"…","e2e":"…"}, "msg"}.
- coord\LEAD.requests.jsonl (LEAD → DEV): {"to","pr","type":"start"|"changes"|"ci_failed"|"stop","items":[…]}.
- coord\<AGENT>.status.json: current pr, phase, last update. Older than 30 min = maybe stuck: LEAD checks the
  DEV's log, never takes over its worktree while it's alive.
- Poll incoming files between steps, at least every 10 min while idle.

3d. LOCKS (create-exclusive: Node fs.openSync(p,'wx') / PowerShell [IO.File]::Open(p,'CreateNew'))
- Content: agent, PID, command, start. Release = delete your own file. Stale = PID dead AND > 45 min.
- git.lock: fetch, worktree add/remove. Max 5 min.
- heavy.lock: any e2e run (it does npm run build), npm ci, gradle, emulator. ONE heavy job on the PC at a time.
  Max 40 min. Lint, svelte-check and unit tests are light (no lock).
- Order when two are needed: git.lock, then heavy.lock. Never wait for one while holding the other.

3e. HOST GUARD (16 GB RAM, Ryzen 7 5800HS)
- Before taking heavy.lock: free RAM ≥ 3 GB and free disk C: ≥ 15 GB, else wait 5 min and re-check.
- Only targeted e2e locally (the specs your PR touches, phone + desktop projects). CI runs the full suites.

══════════════════════════════════════════════════════
4. THE LOOP [ALL]
══════════════════════════════════════════════════════

4a. LEAD PREFLIGHT (target 30 min)
1. Check: gh auth ok, repo checkout clean (git status), Node 22, free RAM/disk. Record base = origin/main SHA.
2. Run root + coord\ + PROMPT.md. Under git.lock: git fetch; create <run>\<AGENT>\wt for LEAD, DEV-A, DEV-B
   (git worktree add --detach <wt> origin/main).
3. In each worktree: junction app\node_modules → the repo's app\node_modules
   (New-Item -ItemType Junction). Removing a worktree later: rmdir the junction FIRST, then worktree remove.
4. In each DEV worktree (.opencode/ is untracked in this repo, so a fresh worktree has none):
   copy qa\build\opencode.build.json → <wt>\.opencode\opencode.json and the repo checkout's
   .opencode\agents\builder.md → <wt>\.opencode\agents\builder.md. Make sure `.opencode/` is listed in
   .git\info\exclude (shared by all worktrees) so it can never be staged.
5. Issues: label `<RELEASE>` + `build-loop` (create once). One issue per PR of the release from BREAKDOWN.md:
   title "<RELEASE> PR <n>: <title>", body = the BREAKDOWN section + "Built by the build loop.".
   Skip any already open with the same title.
6. plan.json from PLAN §8 + the assignment table (§7). ready.json go = true.

4b. DEV LOOP
1. Wait for ready.json go = true (poll 30 s, give up after 45 min → blocker, stop).
2. Canary once: edit app\src\lib\.canary (create), check it worked, delete it. Denied → blocker "permissions".
3. Take your next task from LEAD.requests.jsonl type "start" (LEAD only starts a task whose needs are merged).
4. git switch -c <branch> origin/main (branch name from plan.json, e.g. feat/v3.2-pr3-reschedule).
5. Read the BREAKDOWN section, CLAUDE.md rules, every file you will touch. Write a 5-line plan into
   <run>\<DEV>\logs\pr-<n>.md before coding.
6. Build. Add the tests BREAKDOWN lists. Add docs\release\<RELEASE>\PR-<n>.md.
7. In app\: npm run lint · npm run check · npm run test:unit · targeted e2e under heavy.lock:
   $env:E2E_PORT=<yours>; npx playwright test <specs> --project=desktop --project=phone --project=phone-landscape
   All green → commit (message: "<type>(<area>): <what> (#<issue>)" + blank line + "Co-Authored-By:" line
   from §8). Append ready_for_review with commit SHA and the four summary lines.
8. Wait for LEAD's verdict. "changes" → fix on the same branch, new commit (no amend), report again.
   Meanwhile you may start your next queued task ONLY if LEAD sent "start" for it.
9. After 2 rounds of changes on one PR, LEAD takes it over; you move on.

4c. LEAD LOOP (repeat until done or budget)
1. Hand out "start" requests: each DEV has at most 1 task in building + 1 in review.
2. Review each ready_for_review (§5). Clean → push branch, open PR (§8), state ci.
3. CI: gh pr checks <n> every 5 min (no faster). Green → merge (gh pr merge <n> --merge --delete-branch),
   state merged, git fetch, unblock dependents. Red → read the failed log, flaky (passes on 1 re-run) → re-run
   once; real → "ci_failed" to the author with the failing test + error lines.
4. Build your own assigned PRs between reviews. Before pushing your own PR: a review subagent (fresh Claude
   context) reviews the diff against BREAKDOWN + §5.
5. Every 30 min: status.json, host readings, check DEV status ages.

4d. END
- All release PRs merged → LEAD makes the release docs PR (§5f), merges it after CI. Then stop: tags are the
  owner's.
- Budget: at 0.85 × budget no new tasks. Finish reviews in flight. Unmerged work stays on pushed branches
  (open PRs, marked draft) or local commits listed in the report.
- Cleanup (LEAD): stop every process you started, rmdir junctions, git worktree remove, git worktree prune.
  Repo checkout must be unchanged (git status).
- report.md: per PR: issue, PR link, state, review rounds, CI runs, tests added; blockers; what the owner must
  do (tag, migration PRs to merge, decisions).

══════════════════════════════════════════════════════
5. REVIEW CHECKLIST [LEAD]
══════════════════════════════════════════════════════

Read the diff AND the code it touches (callers, schema, tests). Verdict = clean | changes (numbered items, each
with file:line and the fix expected) | take-over.
1. Does what BREAKDOWN says, all of it, nothing extra. PLAN §7 decisions respected.
2. CLAUDE.md code + phone rules (§2 above). Undo entry for every mutation.
3. Security: access through level()/need() or owner scoping in the repo layer; zod .strict() on every new
   input; public routes rate-limited; no private data in URLs, logs, push payloads.
4. Dates: owner-local vs UTC correct; no new Date('YYYY-MM-DD'); tz edges tested.
5. Tests: new behaviour has a unit or e2e test that fails without the change. No skipped/weakened tests.
6. Phone + desktop both handled; 48 dp; no desktop words on phone.
7. Only intended files: no .opencode, no lockfile churn, no stray debug, no formatting-only noise.
8. Fragment docs\release\<RELEASE>\PR-<n>.md present and true.
Run lint + check + unit yourself in your worktree on the DEV's commit (git switch --detach <sha>) before
pushing. Light work, no lock.

5f. RELEASE DOCS PR [LEAD]
Branch docs/<RELEASE>-notes: fold every fragment into AGENTS.md, CLAUDE.md "Now", docs/HANDOFF.md,
docs/BUILD-NOTES.md, docs/v2/FEATURES.md, docs/v2/RELEASE-NOTES.md (draft section, version not bumped),
docs/v2/PHASES.md row, docs/SERVICE-HANDOFF.md if routes/env/outbound/backups changed. Delete the fragments.

══════════════════════════════════════════════════════
6. BLOCKERS [ALL]
══════════════════════════════════════════════════════

- A spec gap, an open decision, a needed dependency, a failing test you can't explain in 30 min → don't guess.
  DEV: blocker line to your out file, then wait for LEAD. LEAD: decide from PLAN/BREAKDOWN/PRD if it's clearly
  answered there; otherwise write it to <run>\blockers.md for the owner, mark the task blocked, move on.
- Never stop the whole night for one blocked task.

══════════════════════════════════════════════════════
7. ASSIGNMENT [LEAD writes into plan.json]
══════════════════════════════════════════════════════

Weaker / faster models get S–M, well-specified PRs. LEAD keeps security-heavy and migration PRs.

v3.2
| PR | Owner | Needs |
|---|---|---|
| 3 reschedule + Postpone/Skip | DEV-A | — |
| 6 print week | DEV-A | — |
| 4 Slipped list | DEV-A | 3 merged |
| 5 agenda() refactor | DEV-B | — |
| 1 Keep trash restore | DEV-B | — |
| 2 Android hint copy | DEV-B | — |
| 7 ICS export (public route) | LEAD | 5 merged |

v3.3 / v4.0: LEAD writes the table at preflight using the same rule (migrations 8 and 15, ICS import 11,
digest 12, backlinks 20, drag handles 29 → LEAD; the rest split by dependency chains so each DEV owns a chain).
Migration PR first, opened for the owner; dependents wait until the owner merges it (blocked until then).

══════════════════════════════════════════════════════
8. FORMATS [LEAD unless noted]
══════════════════════════════════════════════════════

- Branch: feat/<release>-pr<n>-<slug>, fix/<release>-pr<n>-<slug>.
- Commit trailer (everyone): Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com> for LEAD commits.
  DEV commits: Co-Authored-By: DeepSeek (opencode) <noreply@opencode.ai>.
- PR title = issue title. Body: "Fixes #<issue>" · what changed · tests (summary lines) · review rounds ·
  last line "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- gh pr create --base main --head <branch> --label <RELEASE> --label build-loop.

══════════════════════════════════════════════════════
9. LAUNCH AND RESUME [owner + ALL]
══════════════════════════════════════════════════════

Before the first night (once): this file, qa/build/opencode.build.json, docs/v4/PLAN.md and
docs/v4/BREAKDOWN.md must be on main (worktrees are cut from origin/main). .opencode/agents/builder.md stays
local in the repo checkout (LEAD copies it into the DEV worktrees).

Pick RUN_ID = <date>-<release>, e.g. 2026-11-25-b32. Same RUN_ID + RELEASE for all three.

1. LEAD (PowerShell, repo root, Claude Code with the permission mode used for the QA loop):
   claude "You are LEAD. RUN_ID=<id> RELEASE=v3.2 BUDGET=8h. Read qa/BUILD-LOOP.md fully and follow every [ALL] and [LEAD] part."
2. Wait until C:\Users\Public\lt-build\<id>\coord\ready.json shows "go": true (≈ 30 min).
3. DEV-A (new PowerShell):
   cd C:\Users\Public\lt-build\<id>\DEV-A\wt
   opencode run --agent builder -m <deepseek model id> "You are DEV-A. RUN_ID=<id> RELEASE=v3.2. Read C:\Users\Public\lt-build\<id>\PROMPT.md fully and follow every [ALL] and [DEV] part. Keep looping until LEAD sends stop."
4. DEV-B: same, with DEV-B.

Resume: any agent whose session ends early is relaunched with the same command. On start, every agent reads
its own status.json and the coord files first and carries on from there (never restarts a task from scratch,
never re-creates issues, worktrees or branches that exist).
