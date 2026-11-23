# CLAUDE.md — Life Tracker

Caveman rules for Claude Code in this repo. Read `AGENTS.md` first (one page of truth), then `docs/HANDOFF.md`.

## Now

- **Live = v3.0.0** at `https://planner.jeremyjosh.org` (homelab Docker + Cloudflare Tunnel), verified 2026-11-19 via `/healthz`. **Owner deploys. Agents never deploy, never touch live data.**
- Code = v3.0.0 (`app/package.json`), tag + GHCR image + GitHub Release + `life-tracker-3.0.0.apk`. Migrations 0009, 0010.
- Mobile overhaul (#106) DONE (`docs/v3/MOBILE-SPRINT.md`). Next = v2.1 backlog (`docs/v2/CHAT-HANDOFF.md`) + open review items (`docs/REVIEW.md`). One branch + PR per issue off `main`.
- Tests at this commit: 371 unit · desktop e2e 25 (+1 skipped near midnight) · phone e2e 246 (`docs/v3/QA-RUN-2026-11-19.md`).
- Known bugs before you touch anything: `AGENTS.md` §Known issues (Keep trash restore 404, graph sigma console error, Android desktop-word hints).

## Docs

- v2/v3 truth: `docs/v2/PRD.md` → `FEATURES.md` → `DESIGN.md`. Decisions list = PRD §12 (D-xx). Don't guess an open D-xx — ask.
- Must keep: `docs/v2/RELEASE-PARITY.md` (every v1.1.0 feature). UX rules: `UX-AUDIT.md`. De-hard-wiring: `SYSTEM-AUDIT.md` + DESIGN §5b.
- Wireframes: `wireframes/v2/canvas.json` + `*.dc.html` (desktop rows, phone rows `M*.dc.html`). `wireframes/*.dc.html` at top level = v1, reference only.
- v1 docs = history: `docs/TECHNICAL.md`, `docs/REQUIREMENTS.md`, `docs/PSEUDOCODE.md`. Current behaviour: `docs/BUILD-NOTES.md`. Ops: `docs/SERVICE-HANDOFF.md` — update it when env, outbound calls or backups change.
- Write docs caveman style: short lines, no filler. If a doc disagrees with code, code wins — then fix the doc.

## Code rules

- Node 22. SvelteKit 2 + Svelte 5 runes. SQLite better-sqlite3 (pinned 12.11.1). Drizzle, forward-only migrations. zod `.strict()`.
- Repo layer owns SQL + scoping. Routes never build SQL. Never trust client owner/user ids.
- One access check: `level()`/`need()` in `lib/server/repo/shares.ts`. It returns null for soft-deleted rows — don't route restore paths through it.
- Item `date/time` = owner-local; blocks + `*_at` = UTC. Never `new Date('YYYY-MM-DD')`.
- No behaviour keyed on a type *name* — use `item_types` flags.
- New setting default = old behaviour. Every mutation gets an undo entry.
- Every drag has a click/keyboard path. Hit targets ≥ 24 px. No visible scrollbars.
- E2E and dev share `.svelte-kit`: never run two Vite servers on the same checkout.

## Phone rules (Mobile overhaul, #106)

- Phone layout = width < 700 px OR (pointer: coarse and max-height 500 px).
- Hit areas ≥ 48 dp on phone (desktop rule stays 24 px).
- Swipe = peers only (days, weeks, months, row actions). Never between tabs.
- Long press = pick up / select. Never delete, never a menu.
- Row swipe right = done, left = delete (Keep: archive). Always Undo.
- One shared bottom sheet (`BottomSheet.svelte`). Back closes the top layer first: new sheet / dialog / menu root gets `use:backCloses` (`lib/client/layers.ts`).
- `invalidateAll` only from `$lib/client/refresh` (lint rule): Back drops a refresh in flight, layers redo it.
- No "Click" / "Ctrl" / "Esc" / "PC view" text on phone — the Android shell still violates this (see AGENTS.md).
- Test in the phone projects (`npm run test:e2e:phone`, `tests/e2e/phone/`).

## Done per phase

lint + types + unit + e2e (desktop + phone) green · docs updated (`AGENTS.md`, this file, `HANDOFF.md`, `BUILD-NOTES.md`, `PHASES.md`) · PR into `main` · PHASES.md status row filled.
