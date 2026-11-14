# Life Tracker

Self-hosted Notion replacement for Jeremy (+ Neina). Desktop first. Calendar + day planner core.

Start here (Claude: read all before coding):
1. `docs/REQUIREMENTS.md` — what (FR ids, phases P1/P2/P3, acceptance).
2. `docs/TECHNICAL.md` — how (stack, time rules, schema, auth, sharing, API, components).
3. `docs/DEPLOYMENT.md` — local dev + how a release (image) is made.
3b. `docs/SERVICE-HANDOFF.md` — ops contract: deploy, upgrade, rollback, backup, troubleshoot. **Deploy chat reads only this + `deploy/`.**
4. `docs/REVIEW.md` — review fixes + open owner decisions.
5. `docs/STRUCTURE.md` — full file tree.
6. `docs/PSEUDOCODE.md` — core flows. Per-file pseudocode = comments in each file.
7. `docs/BUILD-NOTES.md` — what the app does now + where it differs from spec. Wins over 1–2.
8. `docs/HANDOFF.md` — current state, code map, next steps. **New chat: read this first.**

| Path | What |
|---|---|
| `data/` | Personal data (Notion raw + seed + app.db). **Gitignored. Never push.** |
| `scripts/transform_notion.py` | raw → seed. |
| `wireframes/` | Design canvas copies. |
| `app/` | SvelteKit app: calendar, planner, quick add, Keep, Pages (+ databases, graph), reminders, sharing, phone/PWA. Old Places/Lists/People/Ideas/Workouts data → Keep via Settings › Account. |
| `.env.example` | dev → `app/.env`. |
| `deploy/` | prod bundle: `compose.yaml` (pulls released image), `.env.example`, `backup.sh`, `restore.sh`. |
| `.github/workflows/` | `ci.yml` (lint, check, unit, e2e, image build) · `release.yml` (tag `vX.Y.Z` → GHCR image + GitHub Release). |

Status 2026-11-14: **v2.0.2 released** (tag `v2.0.2`; phone pass + Android push fixes on top of v2.0.1). Live = v1.1.0 until the owner upgrades (`docs/SERVICE-HANDOFF.md` §5). v2 adds Keep, Pages + databases + graph, reminders + push, page/note sharing, phone screens + PWA. What changed: `docs/v2/RELEASE-NOTES.md`. Plan + phase log: `docs/v2/PHASES.md`. 341 unit + 25 e2e pass.

Repo private.
