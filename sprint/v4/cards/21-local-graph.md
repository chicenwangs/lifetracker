# Card 21 · feat: 2-hop local graph

- Source: BREAKDOWN PR 21 (lines 154–157) · PLAN §1b (line 36, the v2.1 backlog item), §8 PR 21 (line 285), §8 line 299 (16–20 touch `PageEditor.svelte` / `extensions.svelte.ts`) · DESIGN §2.10 (lines 135–139; board D-P8 `wireframes/v4/index.html:442`), §0 (lines 9–15), §3 (lines 157–166) · AGENTS.md §Known issues 1 (BREAKDOWN line 156 calls it "Known issue 2") · `docs/v2/FEATURES.md` PG-GRAPH line 127 ("local graph (EXT)") · decisions — (none)
- Needs: 16 (`GraphDTO` nodes carry the icon the labels draw, card 16 line 19), 20 (PLAN §8 line 285) · Size: M · Branch: `v4/21-local-graph`

## What

Page ⋯ → "Local graph" opens a dialog with the page at the centre: its direct links at one hop, their links at two, rendered by the same sigma view the graph page uses. The server filters the set, so the dialog only ever receives the pages around this one. The sigma "Container has no width" console error is fixed here, in the dialog and on `/pages/graph`.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Page ⋯ gets `Local graph` in the second menu group (DESIGN line 99 puts it after `Duplicate` / `Make template`; whichever of cards 17/22 has landed comes first) (`pages/[id]/+page.svelte:204-238`). It is a read-only action, so it is offered on a page shared with me and on my archived page (DESIGN §3 line 165 lists Local graph among read-only actions); a page id I cannot see stays a 404. On a page shared with me the dialog is built from my own graph plus that page as the centre node (C3), so no other page of the owner's is drawn.
- C2 Desktop: a 900 × 640 dialog over the page; phone: a full-screen sheet. Top bar = title `Links around <icon><title>`, a `Depth 1 | 2` segmented control, an `Open full graph` link and a close ✕. Back closes the dialog before the page and focus returns to the ⋯ button (DESIGN lines 136–139; board D-P8; `backCloses`, `lib/client/layers.ts:77-113`).
- C3 `GET /api/graph?around=<id>&depth=1|2` returns only the pages within that many hops of `<id>` plus `<id>` itself, built from `graph(me)` — my live pages and their edges — with the shared page added as the centre node when it is not one of mine but `level(me, 'page', id)` lets me read it (`shares.ts:22-35`); every other node is filtered exactly as today (`graph.ts:11-34`). `MAX_NODES` is respected (`graph.ts:7`): nodes beyond the cut or beyond the cap are absent and `truncated` is set when the cap cuts the set. A page id I cannot see is a 404; without `around` the endpoint returns exactly today's workspace graph, so `/pages/graph` and `app/tests/unit/graph.test.ts` keep working (BREAKDOWN line 155).
- C4 A hop follows both `link` and `parent` edges, as the full graph draws them (D-V4-33), and exactly `depth` hops are returned: with `depth=1` a neighbour's neighbour is absent, with `depth=2` it is present, and a third-hop page never is. The unit test builds a chain A–B–C–D and asserts each depth (BREAKDOWN line 157 "unit depth filter").
- C5 Nodes: this page is the big node in `--ink`; 1-hop nodes medium; 2-hop nodes small and faded. Label = icon + title (the icon arrives with card 16's `GraphDTO` change, `graph.ts:11-23`, `types.ts:205-210`). Tapping a node opens `/pages/<id>` and closes the dialog (DESIGN line 137, 139).
- C6 Every colour comes from a token (`--ink`, `--quiet`, `--card`, `--accent`), read the way `/pages/graph` reads them (`pages/graph/+page.svelte:73-77, 97, 101`), and the dialog renders correctly in both themes (DESIGN §0 line 9; §3 line 166).
- C7 The sigma "Container has no width" error is gone: sigma is created only after its container reports a non-zero width (or on a resize), both in the dialog and in `/pages/graph`, and an e2e run at desktop width, at 412 px and at 915 × 412 opens the dialog and `/pages/graph` and fails on any sigma console error (AGENTS.md §Known issues 1; BREAKDOWN line 156).
- C8 States (DESIGN §3): loading — a placeholder box of the right size with no spinner over 300 ms while the request runs; empty — a page with no edges shows "No links yet. Link this page from another page with `[[]]`." instead of an empty canvas (D-V4-33); error — an inline `.alert` with the server message and `Retry` inside the dialog (line 163); offline — "You're offline", no graph (line 164).
- C9 `Open full graph` goes to `/pages/graph` and closes the dialog; the full graph's own `Around a page` scope keeps working unchanged (`pages/graph/+page.svelte:24-37, 195-202`).
- C10 Phone: the sheet is full-screen with 48 dp controls (close, both depth options, `Open full graph`), tapping a node opens its page, Back closes the sheet before the page, and no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15).
- C11 Undo: nothing to undo — the dialog and the endpoint only read; opening, changing depth, panning and tapping a node write no row, no journal entry and no toast.
- C12 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-GRAPH row and the tests line), and `AGENTS.md` §Known issues loses the sigma entry (it no longer reproduces).

## Out of scope

- The backlinks panel (card 20) and the `[[` picker (card 19).
- Changing the full graph page's layout, its filters or its list view, beyond the width fix of C7.
- 3D/hierarchical layouts, edge labels, hop animations, saving the depth, or a URL for the dialog.
- Graph edges from database relations (FEATURES PG-GRAPH line 127 says "DB relation later").

## Files likely touched

- `app/src/lib/server/graph.ts` (whole file, 41 lines: `MAX_NODES` 7, node query 11–23, link edges 29–34, return 35–40)
- `app/src/routes/api/graph/+server.ts` (line 6, read query params)
- `app/src/lib/types.ts` (`GraphDTO` 205–210)
- `app/src/lib/components/LocalGraph.svelte` (new) or `app/src/lib/components/GraphView.svelte` (new, extracted from `/pages/graph`; D-V4-33)
- `app/src/lib/components/Dialog.svelte` (read-only: a 900 × 640 variant is the alternative to a new dialog)
- `app/src/routes/pages/[id]/+page.svelte` (menu 204–238, dialog mount near 288)
- `app/src/routes/pages/graph/+page.svelte` (onMount init 62–149, sigma 93–108, canvas 216–223, CSS 332–340)
- `app/src/lib/graph-layout.worker.ts` (read-only)
- `app/tests/unit/graph.test.ts`, `app/tests/unit/v4-21-local-graph.test.ts` (new)
- `app/tests/e2e/v4/21-local-graph.spec.ts` (new), `app/tests/e2e/phone/v4-21-local-graph.spec.ts` (new)
- `AGENTS.md` (§Known issues)

## Tests

- Builder: unit — depth cut of 1 and 2 over A–B–C–D, archived/record nodes inside the set, a shared page as the centre showing its own node plus my linked pages and none of the owner's private pages, `MAX_NODES` cut sets `truncated`, no-`around` output equals the old `graph()` — in `app/tests/unit/v4-21-local-graph.test.ts`; desktop e2e ⋯ → Local graph → 3 nodes at depth 1 → depth 2 adds the fourth → tap opens the page → no console error — `app/tests/e2e/v4/21-local-graph.spec.ts`; phone sheet, 48 dp controls, Back, no console error at 412 px and in landscape — `app/tests/e2e/phone/v4-21-local-graph.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-21-blind.test.ts`, `app/tests/e2e/v4/21-blind.spec.ts`, `app/tests/e2e/phone/v4-21-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 PG-GRAPH), `AGENTS.md` (§Known issues).

## Decided

- Decided: D-V4-33 — link and parent edges, as the full graph draws both; ship the `Depth 1 | 2` control, default 2, no persistence; empty copy "No links yet. Link this page from another page with `[[]]`."; include archived and record pages, marked as today; `Needs: 16` for the graph icon; extract `GraphView.svelte` and use it in both places (fixes the width bug once).
