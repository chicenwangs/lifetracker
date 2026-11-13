# Spikes (P0)

Caveman doc. Throwaway proof code for `docs/adr/`. **Not shipped**: own `package.json`, not in the app image (`.dockerignore`), not run by CI.
P3/P5/P1/P6 copy what they need into `app/` and add the dependency there. Delete this folder after P6.

## Run
```bash
cd spikes && npm ci
```
```bash
npm run s1
```
```bash
npm run s2
```
```bash
npm run s3
```
```bash
npm run s4
```

| Spike | Proves | Needs | Result 2026-11-13 | ADR |
|---|---|---|---|---|
| `s1` Tiptap + Svelte 5 | round-trip, `/` menu, selection, block ops, leaks | Playwright Chromium (`cd ../app && npx playwright install chromium`) | 22/22 | 002, 003 |
| `s2` graph at 5k/20k | frame times, worker layout, click + keys, CSP | same; **opens a browser window** (headless numbers are wrong) | 14/14 | 007 |
| `s3` upload streaming | limits, memory, cleanup, EXDEV | `npm ci` in `../app` (uses SvelteKit's request code) | 11/11 | 005 |
| `s4` Web Push | subscribe → send → show | installed Edge and/or Chrome; **internet** (sends 1 dummy push per browser) | 6/6 Edge · Chrome not installed | 006 |

Each runner prints PASS/FAIL lines and exits 1 on any FAIL.

## Files worth copying later
- `s1-tiptap/blocks.js` — block select/move/duplicate/delete.
- `s1-tiptap/slash.svelte.js` + `SlashMenu.svelte` — `/` menu pattern.
- `s2-graph/layout.worker.js` — CSP-safe layout worker.
- `s3-upload/store.mjs` — streamed save with byte cap, sha256, tmp cleanup, EXDEV fallback.
- `s4-push/sw.js` — push + click handler.
