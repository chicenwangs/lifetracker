# ADRs — architecture decisions

Caveman doc. One file per decision. Changed decision = new ADR that supersedes the old one (DESIGN §22).
Spike code + how to re-run: `spikes/README.md`. Numbers below were measured 2026-11-13 on the owner's PC.

| ADR | Decision | Status | Proof |
|---|---|---|---|
| [001](001-monolith-sqlite.md) | One SvelteKit process + one SQLite file | Accepted | v1.1.0 in production |
| [002](002-editor-tiptap.md) | Pages editor = Tiptap 3 | **GO** | S-1, 22/22 |
| [003](003-block-storage.md) | One row per top-level block, Tiptap JSON inside; save = replace all | Accepted | S-1 round-trip, P3 tests |
| [004](004-db-record-model.md) | Databases = rows (props, records, values) | Accepted | design only, no spike |
| [005](005-attachments.md) | Stream to `uploads/.tmp`, rename into place | **GO**, 2 things unproven | S-3, 11/11 |
| [006](006-scheduler-push.md) | In-process job runner + `web-push` | **GO with conditions** | S-4, 6/6 on Edge only |
| [007](007-graph-renderer.md) | Graph = sigma (WebGL) + own layout worker | **GO with limits** | S-2, 14/14 |

| [008](008-co-edit.md) | Co-edit: none in v2.0, 409 on clash, Yjs → v2.1 | **Accepted** | P7 |

| [009](009-offline-sync.md) | Offline: shell + offline page; Keep edits queue on device, clash = both copies | **Accepted** | P8 |

## Not proven yet (carry into the phase that builds it)

| What | Why not | Check in |
|---|---|---|
| Push on Chrome (FCM), Android, iOS | Chrome not installed on the dev PC; no phone in the loop | P6, on a staging copy |
| Push from the homelab through the tunnel | needs the server (outbound 443) | P6 + deploy chat |
| Uploads on the real read-only container | no Docker on the dev PC | P1 (CI builds the image) or P9 rehearsal |
| Real cross-disk rename (EXDEV) | one disk here; error was injected | same |
| Graph at 5k/20k at 60 fps | 29 fps on the integrated GPU; cause not found | P5, first task |
| Dashed archived nodes, phone graph fallback | not spiked | P5 |
