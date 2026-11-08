# Life Tracker

Self-hosted Notion replacement for Jeremy (+ Neina). Desktop first. Calendar + day planner core.

Start here (Claude: read all before coding):
1. `docs/REQUIREMENTS.md` — what (FR ids, phases P1/P2/P3, acceptance).
2. `docs/TECHNICAL.md` — how (stack, time rules, schema, auth, sharing, API, components).
3. `docs/DEPLOYMENT.md` — localhost (Windows) → homelab Docker → Cloudflare Tunnel.
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
| `app/` | SvelteKit app: calendar, planner, quick add, sharing. Places/Lists/People/Ideas/Workouts parked (separate services later). |
| `.env.example` / `.env.prod.example` | dev → `app/.env`; prod → root `.env`. |

Status 2026-11-08: core built (auth + open sign-up, home month + planner, week, item, quick add, import, settings, calendar sharing by code). Goals and Courses removed. 237 unit + 14 e2e pass. Next: homelab (Stage B) → Cloudflare Tunnel (C) → invite users → test core loop + sharing.

Repo private.
