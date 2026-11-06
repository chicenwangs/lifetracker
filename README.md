# Life Tracker

Self-hosted Notion replacement for Jeremy (+ Neina). Desktop first. Calendar + day planner core.

Start here (Claude: read all before coding):
1. `docs/REQUIREMENTS.md` — what (FR ids, phases P1/P2/P3, acceptance).
2. `docs/TECHNICAL.md` — how (stack, time rules, schema, auth, sharing, API, components).
3. `docs/DEPLOYMENT.md` — localhost (Windows) → homelab Docker → Cloudflare Tunnel.
4. `docs/REVIEW.md` — review fixes + open owner decisions.
5. `docs/STRUCTURE.md` — full file tree.
6. `docs/PSEUDOCODE.md` — core flows. Per-file pseudocode = comments in each file.
7. `docs/P1-NOTES.md` — what P1 built, where it differs from spec, what is left.

| Path | What |
|---|---|
| `data/` | Personal data (Notion raw + seed + app.db). **Gitignored. Never push.** |
| `scripts/transform_notion.py` | raw → seed. |
| `wireframes/` | Design canvas copies. |
| `app/` | SvelteKit app. P1 built. P2 module files still pseudocode. |
| `.env.example` / `.env.prod.example` | dev → `app/.env`; prod → root `.env`. |

Status 2026-11-06: **P1 built** (auth, home month + planner, week, item, quick add, import, settings). 103 unit + 8 e2e pass. Next: use P1 daily 1 week (Stage A/B), then P2.

Repo private.
