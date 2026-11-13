# ADR-007 — graph renderer

Status: **GO with limits** (2026-11-13). Spike S-2 `spikes/s2-graph`, **14/14 checks**. Tested: `sigma 4.0.6`, `graphology 0.26`, `graphology-layout-forceatlas2 0.10.1`.
Machine: owner's laptop, integrated AMD Radeon, 1440×900, 144 Hz. Real browser window (see "headless" below).

## Decision
- Renderer = **sigma** (WebGL) on a **graphology** graph. Framework-free, mounts in a Svelte component (`onMount` → `new Sigma`, teardown → `kill()`).
- Layout = ForceAtlas2 in **our own module worker file**. Server sends compact arrays (DESIGN §10); worker posts back a `Float32Array` of positions.
- **Smooth target = 2,000 nodes / 8,000 edges.** 5,000 / 20,000 must work, not be silky.

## Numbers
| | 2k / 8k | 5k / 20k |
|---|---|---|
| Pan + zoom frame (p50 / p95) | **13.9 / 20.8 ms** (72 fps) | **34.7 / 34.9 ms** (29 fps) |
| Page while layout runs (p95 frame) | 13.9 ms | 41.7 ms |
| Worker, 5 layout steps | 39 ms | 120 ms |
| Apply positions on main thread | 16.7 ms | 41 ms |

Selection re-draw: 0.3 ms. Click selects, arrow keys walk along links. Runs under the app CSP. No outside requests.

## Findings
- **Don't use the library's built-in layout worker.** It starts from a `blob:` URL, which our CSP (`script-src 'self'`) blocks. Own worker file works and needs no CSP change.
- **Full `refresh()` = ~107 ms at 5k/20k.** Selection/hover must use `refresh({ partialGraph: { nodes }, skipIndexation: true })` (0.3 ms).
- Applying positions costs 41 ms per update at 5k. Throttle layout updates (a few per second) and stop the worker when the layout settles.
- **5k/20k is capped at ~29 fps here and the cause is not found.** JS is idle 93% of the frame. Hiding edges, labels, 3,000 nodes, or quartering the canvas did not change it → a fixed per-frame GPU-side cost. P5 first task: find it (suspects: picking pass, buffer re-upload). Not a blocker: 29 fps pans fine.
- Fully zoomed out, a node is ~3 px and a click misses it. Set `nodePickingPadding` / a minimum hit size (CLAUDE.md: hit targets).
- Picking uses the frame drawn after the hover; a scripted click in the same frame misses. Real users always hover first.
- **Headless Chrome numbers are useless** for this (366 ms per frame vs 35 ms in a window). Perf checks must run headed.

## Cost
440 KB JS, **110 KB gzip** + 78 KB worker. Load only on the Graph route.

## Not covered (P5)
- **Dashed archived nodes** (wireframe): sigma has no dashed node. Options: muted colour + ring, or a custom node program. Not spiked.
- Phone: DESIGN says list/tree fallback. Not spiked.
- Local graph mode, label density on a real graph (test data was synthetic clusters).

## Fallback
If P5 can't reach an acceptable 5k/20k on the owner's devices: cap nodes per response + local graph mode (already in DESIGN §10 "Caps"). Renderer stays.
