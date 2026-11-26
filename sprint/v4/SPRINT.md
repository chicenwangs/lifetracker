# v4 sprint contract

One opencode session (MAIN) builds v4.0.0 alone, for as long as it runs. It cross-checks every piece of work with subagents and a script gate. A separate QA session may run at the same time: its bugs come in as GitHub issues.
Caveman rules. If this file and CLAUDE.md disagree, CLAUDE.md's hard rules win. Code wins over docs.

## 0. Where things are

| What | Where |
|---|---|
| Build clone (MAIN works here, branch per card) | `C:\Users\Public\lt-v4\build` |
| Gate worktree (scripts only, never edit) | `C:\Users\Public\lt-v4\gate` |
| v3.1.2 copy (upgrade tests, never edit) | `C:\Users\Public\lt-v4\v312` |
| Judge scripts (never edit) | `C:\Users\Public\lt-v4\bin\` (gate.ps1, smoke.mjs, migration-check.mjs) |
| Gate results + logs | `C:\Users\Public\lt-v4\runs\` |
| Live state: board + progress (MAIN only writes) | `C:\Users\Public\lt-v4\state\BOARD.md`, `PROGRESS.md` |
| Plan docs | `docs/v4/PLAN.md` (§7 = owner decisions), `docs/v4/BREAKDOWN.md`, `docs/v4/DESIGN.md`, `wireframes/v4/index.html` |
| Cards, decisions (in git) | `sprint/v4/cards/NN-slug.md`, `sprint/v4/DECISIONS.md` |

Subagents (`.opencode/agents/`): `v4-planner` writes cards · `v4-builder` writes code + tests · `v4-tester` writes blind tests · `v4-reviewer` reviews · `v4-skeptic` hunts hallucinations, ambiguity and gaps.

## 1. Hard rules (never)

1. Never deploy, never touch `planner.jeremyjosh.org`, never use `data/app.db` or any real data, never copy `.env` files.
2. Never tag, never create a release, never bump to a release tag. The owner tags v4.0.0.
3. Never push to `main`, never force-push, never rewrite pushed history. `main` changes only by merging a PR (section 7).
4. Never install an APK on a phone or emulator: the debug APK talks to the live server. Android = build + unit tests only (the gate does it).
5. Never edit `bin\`, the gate worktree, `v312`, `.github/`, `.opencode/`.
6. Never say tests pass. Only a gate result file says that (section 3).
7. Never skip, `.only`, `fixme`, delete or weaken a test to get green. A test that is wrong because a card changes behaviour may change, with the reason in the PR body.
8. Never commit secrets, never `--no-verify`.
9. MAIN never writes feature code itself. Subagents write; MAIN orchestrates, decides, merges. This keeps MAIN's context small.

## 2. Stages

MAIN reads `state\PROGRESS.md` first. Its NOW line says where to continue.

**S0 baseline (once).** `git fetch`, then `gate.ps1 -Mode site` on `origin/main`. It must PASS before any card. If it fails on untouched v3.1.2 code, the gate or the machine is wrong: write it as BLOCKED in PROGRESS with the failing step and log path, and stop work on cards (the owner fixes tooling).

**S1 cards + ambiguity (once, then per new card).**
1. `v4-planner` writes cards for all BREAKDOWN PRs (batches of about 6) plus card 00 and R1 (see BOARD).
2. `v4-skeptic` mode B checks every card for ambiguity.
3. MAIN decides every open question (section 8), updates the card, logs D-V4-xx in DECISIONS.md.
4. One PR `docs(v4): cards + decisions` through the normal merge path (gate quick is enough: no app code).
5. BOARD: every card `carded`.

**S2 build loop.** Cards in BOARD order, respecting `Needs`. One card at a time through section 4. Between cards: QA intake (section 6).

**S3 verify loop (never ends).** When every card is merged:
1. `gate.ps1 -Mode site` on `main`.
2. Gap hunt: `v4-skeptic` mode C on one area per round (planner, types + import, digest + voice, pages editor, links + graph, databases, templates + markdown, phone paths, docs). File each real gap as a GitHub issue (label `v4.0`, title `v4 gap: ...`, severity in body). Fix through section 4 as card `F-<issue>`.
3. QA intake.
4. A round is CLEAN when: site gate PASS, gap hunt found no S1/S2/S3, no open `qa-loop` or `v4.0` issue at S1/S2.
5. Two CLEAN rounds in a row and R1 merged: write `READY for v4.0.0 at <sha>` at the top of PROGRESS. Keep looping (start a new round). Any new S1/S2 removes READY until two clean rounds again.

## 3. The gate (the only judge)

```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Public\lt-v4\bin\gate.ps1 -Mode quick|full|site [-Sha <sha>]
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Public\lt-v4\bin\gate.ps1 -Wait -Max 480
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Public\lt-v4\bin\gate.ps1 -Status
```
- Start returns at once; the gate runs in the background on that exact commit in its own worktree. Default commit = HEAD of the build clone, so commit first.
- `-Wait` blocks up to `-Max` seconds (keep it under your shell tool's timeout). Exit 0 = PASS, 1 = FAIL, 2 = still running (call again).
- quick = lint + check + unit. full = quick + e2e desktop + phone + phone-landscape + migration check (+ Android when `mobile/` changed). site = full + Android + production smoke on an empty DB, an upgraded v3.1.2 DB (x200) and a new seed.
- Zero tests = FAIL. An e2e failure is re-run once: pass on re-run = `flaky` (passes, but file a `flaky test:` issue, label `v4.0`, with the test name).
- Result: `runs\gate-<sha7>-<mode>.json` + one log per step. Read the log of a failed step before fixing.
- Only one gate at a time. While it runs, keep working (next subagent, next card prep). Never edit files in `gate\`.

## 4. One card (the cross-check loop)

Branch `v4/NN-slug` from fresh `origin/main` (`git fetch`, `git switch -c v4/NN-slug origin/main`). BOARD state per step.

1. **build** · `v4-builder` gets: card path, branch, findings to fix (none on round 1). It commits and reports.
2. **quick gate** on HEAD. FAIL: back to builder with the failing step summary + log path.
3. **blind tests** · `v4-tester` gets: card path, branch. It writes tests from the card without reading the builder's tests, commits, reports per check.
4. **full gate** on HEAD (migration cards 08 and 15 and anything touching `app/drizzle`: `site`). Start it, then while it runs:
5. **review** · `v4-reviewer` (diff vs card + rules) and **audit** · `v4-skeptic` mode A (everything used exists, every claim backed, tests real, scope clean). Give the skeptic the builder + tester reports.
6. **decide.** Blocking items = gate FAIL, reviewer `must`, skeptic FAIL, blind test FAIL. A blind test that contradicts the card text is the tester's bug: MAIN decides by quoting the card, and sends the fix to the right subagent. Something the card does not settle: decide (section 8) and update the card.
7. **fix round** · all blocking items to `v4-builder` in one message, then back to step 2. After a fix round, re-run the reviewer and skeptic on the new diff only.
8. **done when all are true on the SAME HEAD sha:** full (or site) gate PASS · reviewer PASS · skeptic PASS · tester's blind tests are in the gate run and pass.
9. **PR + merge** (section 7). BOARD `merged`, PROGRESS entry.

Never run two subagents that build or run tests at the same time: builder and tester share the build clone's `.svelte-kit`. Reviewer and skeptic only read, so they may run together while the gate runs.

Limits: 4 fix rounds per card. Still blocked: BOARD `blocked`, write why in PROGRESS + a GitHub issue (`v4 blocked: card NN`, label `v4.0`), push the branch, move to the next card whose `Needs` are met. Retry blocked cards after every 3 merges.

## 5. Evidence rules (anti-hallucination)

- A claim without evidence is false. Evidence = a gate result file, a commit sha that `git cat-file -e` finds, a test name that exists, a command with its real output line.
- MAIN checks subagent reports before acting: commit exists and is on the branch, files listed are the files changed (`git diff --stat`), counts match the gate file.
- Subagent says "done" but the gate disagrees: the gate wins, always.
- The skeptic checks every name the diff uses has a definition. Reviewers quote the doc line they rely on.
- MAIN writes PR bodies from the gate file and reports, never from memory.

## 6. QA intake (between cards, every S3 round)

`gh issue list --state open --label qa-loop --json number,title,labels,body` and `--label v4.0`.
- Severity: label `S1`..`S4`, or `Severity: Sx` in the body, else S3.
- S1/S2: next work item, before any new card. S3/S4: one fix between feature cards.
- A fix is a card `F-<issue>` (BOARD row, card file only if the fix is bigger than S), branch `v4/fix-<issue>`, same section 4 loop, PR body `Fixes #<issue>`.
- Not a bug, or against a decision: comment the decision id on the issue and leave it open for the owner. Never close a QA issue except through a merged PR.
- Never edit or delete QA issues.

## 7. PR + merge

1. `git push -u origin v4/NN-slug`.
2. `gh pr create --base main --title "<type>(v4-NN): <title>" --body-file <file>`. Body: card link, what changed, `Done when` table (check id -> test name), gate line (mode, sha7, PASS, step counts from the JSON), reviewer + skeptic verdicts, decisions used, anything flaky, NEEDS_REAL_PHONE if any. Label `v4.0`.
3. CI: `gh pr checks <n>` every few minutes while you do other work. CI FAIL: read the log (`gh run view <id> --log-failed`). Real failure: fix round. Looks flaky: `gh run rerun <id> --failed` once. Fails twice: real.
4. `main` moved since your gate: `git merge origin/main` into the branch (no rebase), re-run the full gate, CI again.
5. Merge only when CI is green and step 8 of section 4 holds on the PR head: `gh pr merge <n> --merge --delete-branch`.
6. After merge: `git switch main && git pull`. If CI on `main` goes red, fixing it beats everything.

## 8. Decisions

- Owner decisions first: PLAN §7 and the `O-` list in DECISIONS.md. They override everything.
- Anything else unclear: MAIN decides. Pick the option that (a) matches the docs' intent, (b) keeps old behaviour for existing users, (c) is the smallest change. Log `D-V4-xx` in DECISIONS.md: question, options, choice, why, cards affected. The owner may change it later.
- Never block waiting for the owner. The only owner gates: v4.0.0 tag, deploy, real-phone checks (write `NEEDS_REAL_PHONE: <what>` in PROGRESS).

## 9. Context and restarts

- Everything lives in files: PROGRESS, BOARD, cards, DECISIONS, gate results, git. A fresh session continues from them.
- Keep MAIN lean: give subagents file paths, not file contents. Ask for short reports. Don't read whole logs: read the failing part.
- After every card: PROGRESS entry + NOW line. If your context is getting long, finish the current step, update PROGRESS, then end with `CONTEXT FULL: restart me with the same prompt`.

## 10. PROGRESS format

Top: `NOW: stage=<S0|S1|S2|S3> card=<id> step=<1-9> next=<one line>` (and `READY for v4.0.0 at <sha>` when true).
Then newest first, max 5 lines per entry: `<UTC time> card NN <state> · PR #n · gate <mode> <sha7> PASS/FAIL · rounds n · decisions D-V4-x · notes`.
