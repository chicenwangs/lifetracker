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
7. `docs/P1-NOTES.md` — what the app does now + where it differs from spec. Wins over 1–2.
8. `docs/HANDOFF.md` — current state, code map, next steps. **New chat: read this first.**

| Path | What |
|---|---|
| `data/` | Personal data (Notion raw + seed + app.db). **Gitignored. Never push.** |
| `scripts/transform_notion.py` | raw → seed. |
| `wireframes/` | Design canvas copies. |
| `app/` | SvelteKit app: calendar, planner, quick add, sharing. Places/Lists/People/Ideas/Workouts removed (separate services later). |
| `.env.example` | dev → `app/.env`. |
| `deploy/` | prod bundle: `compose.yaml` (pulls released image), `.env.example`, `backup.sh`, `restore.sh`. |
| `.github/workflows/` | `ci.yml` (lint, check, unit, e2e, image build) · `release.yml` (tag `vX.Y.Z` → GHCR image + GitHub Release). |

Status 2026-11-08: core built (auth + open sign-up, home month + planner, week, item, quick add, import, settings, calendar sharing by code). Goals and Courses removed. 237 unit + 14 e2e pass. Next: homelab (Stage B) → Cloudflare Tunnel (C) → invite users → test core loop + sharing.

Repo private.
