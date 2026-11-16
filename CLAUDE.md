# CLAUDE.md — Life Tracker

Caveman rules for Claude Code in this repo.

## Now
- Live = **v1.1.0** (planner.jeremyjosh.org, homelab Docker + Cloudflare Tunnel). Do not deploy.
- **v2.0.4** released (incl. Android app `mobile/`, 7 widgets) (tag + GHCR image + GitHub Release), not deployed. Owner deploys (`docs/SERVICE-HANDOFF.md` §5). v2 phases all DONE (`docs/v2/PHASES.md`).
- Next work = **Mobile overhaul sprint** (#106). Tracker: `docs/v3/MOBILE-SPRINT.md`. One branch + PR per issue off `main`. v2.1 backlog (`docs/v2/CHAT-HANDOFF.md`) after.

## Docs
- v2 truth: `docs/v2/PRD.md` → `FEATURES.md` → `DESIGN.md`. Decisions list = PRD §12 (D-xx). Don't guess an open D-xx — ask.
- Must keep: `docs/v2/RELEASE-PARITY.md` (every v1.1.0 feature). UX rules: `UX-AUDIT.md`. De-hard-wiring: `SYSTEM-AUDIT.md` + DESIGN §5b.
- Wireframes: `wireframes/v2/canvas.json` + `*.dc.html` (desktop rows, phone rows `M*.dc.html`). `wireframes/*.dc.html` at top level = v1, reference only.
- v1 code docs: `docs/TECHNICAL.md`, `docs/BUILD-NOTES.md` (rename to `BUILD-NOTES.md` in P1), `docs/SERVICE-HANDOFF.md` (ops contract — update it when env, outbound calls or backups change).
- Write docs caveman style: short lines, no filler.

## Code rules (from v1, still true)
- Node 22. SvelteKit 2 + Svelte 5 runes. SQLite better-sqlite3 (pinned). Drizzle. zod `.strict()`.
- Repo layer owns SQL + scoping. Routes never build SQL. Never trust client owner/user ids.
- Item `date/time` = owner-local; blocks + `*_at` = UTC. Never `new Date('YYYY-MM-DD')`.
- Migrations forward-only, keep dormant tables, test on a copy of real data.
- No behaviour keyed on a type *name* — use `item_types` flags.
- New setting default = v1.1.0 behaviour.
- Every drag has a click/keyboard path. Hit targets ≥ 24 px. No visible scrollbars.

## Phone rules (Mobile overhaul, #106)
- Phone layout = width < 700 px OR (pointer: coarse and max-height 500 px).
- Hit areas ≥ 48 dp on phone (desktop rule stays 24 px).
- Swipe = peers only (days, weeks, months, row actions). Never between tabs.
- Long press = pick up / select. Never delete, never a menu.
- Row swipe right = done, left = delete (Keep: archive). Always Undo.
- One shared bottom sheet. Back closes the top layer first.
- No "Click" / "Ctrl" / "Esc" / "PC view" text on phone.
- Test in the phone projects (`npm run test:e2e:phone`, `tests/e2e/phone/`).

## Done per phase
lint + types + unit + e2e (v1 regression too) green · docs updated · PR into `v2` · PHASES.md status row filled.
