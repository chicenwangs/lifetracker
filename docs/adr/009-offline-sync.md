# ADR-009 — Offline

Status: **Accepted (P8, 2026-11-14)** · implements D-06 ("keep both copies").

## Decision
- Service worker caches only hashed build files (`/_app/immutable/*`) + `/offline.html`. Never pages, never `/api` (private data).
- Navigation with no network → offline page. Any API call with no network → clear "You're offline. Not saved." (never fake success). Badge at the top while offline.
- Keep notes only: an edit made offline waits on the device (one entry per note, latest text, first base revision) and is sent in order when back online.
  - 409 (changed elsewhere) → server copy kept, mine saved as a new note "… (offline copy)". Both kept (D-06).
  - 403/404/400 → dropped (unshared, deleted).
  - Sign-out wipes the queue.
- Pages, planner: online only (FEATURES §10 "Offline Pages = later").

## Why localStorage, not IndexedDB (DESIGN §17 said IndexedDB)
Text notes are small; one sync API, no wrapper library. `shortcut:` comment in `lib/client/offline.ts`. Move to IndexedDB if files/images ever go offline.
