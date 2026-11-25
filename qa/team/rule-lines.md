# Lines LEAD adds in phase p00 (to the origin/main versions — never copy these files from the owner's checkout)

## CLAUDE.md — append as the last bullet of "## Now"

- **Team loop running toward v4.0.0** (`qa/TEAM-LOOP.md`, plan `qa/TEAM-PLAN.md`): v3.2 + v3.3 scope + Pages overhaul ship together as **one release, v4.0.0** (no v3.2/v3.3 tags). In the team loop only: LEAD may merge migration PRs to main after `migration-check.mjs` passes (via `qa/team/merge.ps1`); the tag is created only by the owner's `run.ps1 -Approve 4.0.0`. Agents still never deploy, never touch live data or `data/app.db`.

## AGENTS.md — append under the "Live:" bullet of "## What this is"

- Team loop (2026-11-25 →): `qa/TEAM-LOOP.md`. One release v4.0.0 (no v3.2/v3.3 tags). Migration PRs merge after `qa/team/migration-check.mjs`; tag only via the owner's `qa/team/run.ps1 -Approve`. Design for v3.3 + v4.0 screens: `docs/v4/DESIGN.md` + `wireframes/v4/index.html`.

## docs/v4/PLAN.md — insert right under the heading "## 8. Work split (one issue = one branch = one PR off `main`)"

> **Update 2026-11-25 (owner):** no v3.2 / v3.3 tags. Everything below ships as **one release, v4.0.0**. v3.3 = milestone M1, the Pages overhaul = milestone M2 (QA checkpoints, no tags). Run by the team loop: `qa/TEAM-PLAN.md`, `qa/TEAM-LOOP.md`. Screens: `docs/v4/DESIGN.md`.
