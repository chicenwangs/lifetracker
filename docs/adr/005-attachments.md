# ADR-005 — attachments

Status: **GO, 2 things unproven** (2026-11-13). Spike S-3 `spikes/s3-upload`, **11/11 checks**. The spike server uses SvelteKit's own request code (`getRequest` + `bodySizeLimit`), the same path adapter-node runs in production.

## Decision
- Files on disk under `UPLOAD_DIR` (`/app/data/uploads/<2-char>/<key>`), metadata in SQLite. Never in the DB, never under `static/`.
- Upload = stream `request.body` → `UPLOAD_DIR/.tmp/<key>` → count bytes + sha256 on the way → `rename` into place → one short txn marks it `ready`.
- **Temp files live inside the upload dir, not `/tmp`.** `/tmp` is tmpfs (RAM) and another filesystem, so rename would fail.
- If rename still says `EXDEV`: copy + delete. Any other error is thrown.

## What the spike proved
| Check | Result |
|---|---|
| 25 MB upload | complete on disk, sha256 matches |
| Streamed, not buffered | memory in use: **5.4 MB** for 25 MB, **5.7 MB** for 100 MB (does not grow with the file) |
| Over the limit with `Content-Length` | 413, nothing stored |
| Over the limit, chunked (no length) | our byte counter stops it mid-stream, tmp deleted |
| Client drops half way | tmp deleted |
| `EXDEV` on rename | copy + delete works (error injected) |

## Findings that change the plan
1. **adapter-node refuses bodies over 512 KB by default.** Uploads need env `BODY_SIZE_LIMIT` (e.g. `26M`). New line for the ops contract: add to `deploy/.env.example` + SERVICE-HANDOFF when the upload code lands (P1). DESIGN §15 env table does not list it yet.
2. **That limit is global.** Raising it also lets a 26 MB body reach every JSON route. P1 must cap non-upload routes itself (reject `Content-Length` > 512 KB in `hooks.server.ts`; read JSON bodies with a size cap).
3. **No `Content-Type` = SvelteKit gives `request.body = null`.** Upload client must always send one; server answers 400.
4. **An early refusal can look like a dropped connection** to the client (server answers and closes while the browser is still sending). So the UI checks size and type **before** sending and shows its own message. The server check stays as the real guard.
5. Without forced GC, freed chunks pile up before collection (seen: ~41 MB during a 100 MB upload). Not a leak. Matters only if the container gets a tight memory limit.

## Not proven
- **Real read-only container.** No Docker on the dev PC. Design is right on paper (only `/app/data` + `/tmp` writable, we only write under `/app/data`). Prove it in P1 (CI already builds the image) or the P9 rehearsal.
- **Real cross-disk rename.** One disk here.

## Still open
D-12 (max size, allowed types, orphan grace). Spike used the recommended 25 MB. Needed by P1.
