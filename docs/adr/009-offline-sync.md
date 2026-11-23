# ADR-009 — Offline

Status: **Accepted (P8, 2026-11-14)**, rewritten 2026-11-23 to match the shipped design (#105 in v3.0.0, #205, #304). Implements D-06 ("keep both copies") for Keep notes. The P8 first cut (shell only, Keep notes only) is replaced by the text below.

## Decision
- Service worker (`app/static/sw.js`) has two caches.
  - `lt-shell-v2`: hashed build files (`/_app/immutable/*`), manifest, icons, `/offline.html`.
  - `lt-data-v1`: last-seen page navigations, `__data.json` and GET `/api/*` (not `/api/reminders/inbox`, not `/healthz`), so the app opens with no signal. Capped at 300 entries and 14 days. Never `/login` or `/setup`.
  - Sign-out wipes `lt-data-v1`; so does a 401 / 403 / redirect to `/login` (the device must not keep another viewer's data).
- Navigation with no network and no cached copy → offline page. Writes with no network: Keep and planner (below) wait on the device; any other write → "You're offline. Not saved." (never fake success). Badge at the top: "offline", then "Waiting to sync".
- Queues (`lib/client/offline.ts`, localStorage), sent in order when back online:
  - Keep notes: one entry per note (latest text, first base revision, `editedAt`).
    - 409 (the server copy changed later than `editedAt`, or the revision is stale) → server copy kept, mine saved as a new note "… (offline copy)". Both kept (D-06). The toast says how many.
    - 400 / 403 / 404 → dropped (unshared, deleted).
  - Planner: adds, ticks and field edits of items and blocks (`ActionOp`, one PATCH entry per path, fields merged, each with `editedAt`). Server rule (`repo/items.ts`, `repo/blocks.ts`): if the row's `updatedAt` is later than `editedAt`, the server version stays and the offline edit is dropped. Same 400 / 403 / 404 drop.
  - Network, 401, 408, 429 and 5xx keep the rest of the queue for next time.
  - Sign-out wipes both queues (after a successful sign-out only).
- Pages, databases: online only (FEATURES §10 "Offline Pages = later"), except what the data cache shows read-only.

## Why localStorage, not IndexedDB (DESIGN §17 said IndexedDB)
Text notes are small; one sync API, no wrapper library. `shortcut:` comment in `lib/client/offline.ts`. Move to IndexedDB if files/images ever go offline.
