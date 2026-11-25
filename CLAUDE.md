# CLAUDE.md — Life Tracker

Caveman rules for Claude Code in this repo. Read `AGENTS.md` first (one page of truth), then `docs/HANDOFF.md`.

## Now

- **Latest release = v3.1.2** (2026-11-24, bug-fix patch, milestone 3.1.2): tag + GHCR image + GitHub Release + `life-tracker-3.1.2.apk`. `app/package.json` = 3.1.2. Live upgrade = owner.
- Live = `https://planner.jeremyjosh.org` (homelab Docker + Cloudflare Tunnel). Last verified 2026-11-19 via `/healthz` (then v3.0.0); not re-checked since. **Owner deploys. Agents never deploy, never touch live data.**
- **main = v3.2 work, not tagged** (merged 2026-11-25 by the build loop, no migration): Postpone/Skip (#384), Slipped list (#385), print week (#387), ICS calendar feed (#388), `agenda()` refactor (#386), Keep restore test (#382); #383 was already fixed. Next = owner tags v3.2.0 + APK; then v3.3 (`docs/v4/PLAN.md` §8, migration 0011).
- Last migration = 0010 (v3.1.x added none). Migrations 0009, 0010 shipped in v3.0.0.
- Mobile overhaul (#106) DONE (`docs/v3/MOBILE-SPRINT.md`). Next = v3.3 (line above) plus open GitHub issues. v2.1 backlog (`docs/v2/CHAT-HANDOFF.md`) + `docs/REVIEW.md` Open items are parked. One branch + PR per issue off `main`.
- Tests at this commit: 424 unit · desktop e2e 52 · phone e2e 328 (CI). Last QA pass: `docs/v3/QA-RUN-2026-11-23.md` (v3.1.2).
- Known bugs before you touch anything: `AGENTS.md` §Known issues (graph sigma console error at phone width).

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
- No "Click" / "Ctrl" / "Esc" / "PC view" text on phone. Phone e2e `noDesktopHints` checks it.
- Test in the phone projects (`npm run test:e2e:phone`, `tests/e2e/phone/`).

## Done per phase

lint + types + unit + e2e (desktop + phone) green · docs updated (`AGENTS.md`, this file, `HANDOFF.md`, `BUILD-NOTES.md`, `PHASES.md`) · PR into `main` · PHASES.md status row filled.
