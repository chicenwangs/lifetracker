# Life Tracker — chat handoff (2026-11-14)

Paste this into a new chat. It gives the full context. Caveman style.

## What it is
- Self-hosted life planner for one household (owner + partner, 2–5 users, one server, one Node process).
- Repo: `github.com/chicenwangs/lifetracker` (public). Local: `C:\Users\jeremy josh\Desktop\life-tracker`. App in `app/`.
- Stack: Node 22 · SvelteKit 2 + Svelte 5 runes · SQLite (better-sqlite3, pinned) · Drizzle migrations · zod `.strict()` · Tiptap editor · sigma 4 graph · Vitest · Playwright e2e (serial, prod build).
- Live = **v1.1.0** at planner.jeremyjosh.org (homelab Docker + Cloudflare Tunnel). **Never deploy.** Owner backs up and deploys.

## Where things stand
- **v2.0.0 released** 2026-11-14: tag `v2.0.0` (7693218) → GHCR image `ghcr.io/chicenwangs/lifetracker:2.0.0` + GitHub Release with `deploy-v2.0.0.tar.gz` + `SERVICE-HANDOFF.md`. Not deployed.
- `main` = 4bc115c (v2 merge + a test-only flaky fix). `v2` = 851d21a.
- Phases P0–P10 all DONE (PRs #5–#14). Plan + status: `docs/v2/PHASES.md`.
- **Open branch `fix/ui-audit`** (from `v2`), not pushed yet, no PR yet:
  1. `f890eb0` Pages look to wireframes (tree, page bar with Pin/Share, 760 px column, editor spacing, to-do alignment, slash menu, panel padding), graph fix (sigma 4 default `itemSizesReference: "positions"` made nodes giant → `'screen'`, theme colours, all labels), `--muted` token alias.
  2. `3c190d6` audit fixes: global no-scrollbar CSS (FEATURES §1.12), Settings › Preferences "Header pins" card (↑↓ reorder + Unpin, FEATURES §2), phone All pages (title, search, Recent 5 via `pages.recent()`), unit test for `recent`, e2e step for pin reorder, BUILD-NOTES.
- Last full run on `3c190d6`: lint + svelte-check clean, unit 341 green, e2e 25 green.

## Next steps
1. Push `fix/ui-audit` → PR into `v2` → CI green → merge (then `v2` → `main`, maybe tag v2.0.1).
2. Owner call (don't guess): Home due row is "Due today" but spec/wireframe say "No time set today"; list also holds timed items (v1 FR-H12). Rename + untimed only, or keep v1?
3. Owner deploys v2: `docs/SERVICE-HANDOFF.md` §5 (backup first; rollback = `APP_VERSION=1.1.0` + restore backup; v1.1.0 can't read v2 DB). Checks §8.

## Not verified
- Web Push on Chrome/Android/iPhone and through the tunnel (tested on Edge only).
- Uploads in the real read-only Docker container.
- Migration on a copy of the live backup (owner skipped; CI rehearsal `tests/unit/rehearsal.test.ts` builds a v1.1.0 DB and checks every row).
- backup.sh / restore.sh in Docker.

## v2.1 backlog (cut lines)
Live co-edit (ADR-008) · Keep Google Takeout import/export · DB board/calendar/list/gallery views · 2-hop local graph · reminders on page to-dos · swipe gestures · offline queue → IndexedDB · graph archived nodes dashed (now grey + "· archived") · dev-mode graph worker blocked by CSP (`blob:` in `npm run dev`; prod fine) · block drag handles + multi-select in Pages · Keep grid/list toggle.

## Docs map (truth order)
- `CLAUDE.md` (repo rules) → `docs/v2/PRD.md` (decisions D-xx in §12, all closed) → `FEATURES.md` → `DESIGN.md`.
- `docs/v2/RELEASE-PARITY.md` (every v1.1.0 feature must stay) · `UX-AUDIT.md` · `SYSTEM-AUDIT.md` · `RELEASE-NOTES.md` · `PHASES.md`.
- Wireframes: `wireframes/v2/*.dc.html` (+ `canvas.json`; live canvas https://claude.ai/artifact/TsaCjQodZ2xHaNYDuBQLJ5). Phone = `M*.dc.html`. Top-level `wireframes/*.dc.html` = v1, reference only. They need a canvas runtime; read markup + sample data.
- Code docs: `docs/BUILD-NOTES.md` (what the app does now; wins over older docs), `docs/TECHNICAL.md`, `docs/SERVICE-HANDOFF.md` (ops contract — update on env/outbound/backup changes), `docs/adr/`.

## Code rules (CLAUDE.md)
- Repo layer owns SQL + scoping; routes never build SQL; never trust client owner/user ids. Sharing check = `app/src/lib/server/repo/shares.ts` (`need`, `needDb`, `needRecord`; 404 no access, 403 read_only).
- Item `date/time` = owner-local; blocks + `*_at` = UTC. Never `new Date('YYYY-MM-DD')`.
- Migrations forward-only; keep dormant tables. No behaviour keyed on type *name* (use `item_types` flags). New setting default = v1.1.0 behaviour.
- Every drag has a click/keyboard path. Hit targets ≥ 24 px. No visible scrollbars.
- Per change: lint + types + unit + e2e (v1 regression too) green · docs updated · PR into `v2` · PHASES row.
- Docs caveman style. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".

## Commands (from `app/`)
- `npm run dev` (port 5173; `ORIGIN` in `.env` must match or API says `bad_origin`).
- `npm run lint` · `npx svelte-check --threshold error` · `npx vitest run` · `npm run test:e2e` (builds + runs prod on its own port; delete `test-results/` after or prettier lint flags `.last-run.json`).

## Dev PC quirks
- No `gh`, Docker, `sqlite3` CLI, or Chrome (Edge + Brave only).
- PRs: `git push`, then open `https://github.com/chicenwangs/lifetracker/compare/v2...<branch>?expand=1` in the browser.
- CI status: `curl https://api.github.com/repos/chicenwangs/lifetracker/actions/runs` (public, no auth).
- SQLite: Node script with `better-sqlite3` from `app/node_modules`.
- Merges done locally: `git merge --no-ff` with message "Merge pull request #N from chicenwangs/<branch>"; don't pipe merge output (hides failures).
- Release: pushing a `vX.Y.Z` tag runs `release.yml` (CI, GHCR image, GitHub Release with deploy bundle).

## Owner preferences
- Talk caveman (short, simple words) + ponytail (smallest complete change; end replies with what was skipped / risk).
- Ask before guessing an open decision. Don't deploy. Don't touch live data.
