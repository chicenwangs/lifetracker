# ADR-001 — one process, one SQLite file

Status: **Accepted** (2026-11-13). No spike: this is what v1.1.0 already runs.

## Decision
v2 stays a modular monolith: one SvelteKit (adapter-node) process, one SQLite file (`better-sqlite3`, WAL), private uploads dir, in-process job runner. One replica.

```
route (parse, auth) -> service (rules, txn) -> repo (SQL, scoping) -> SQLite
```

## Why
- Few users, one homelab box. No broker, no second database, no distributed transactions to operate.
- Sync SQLite calls = every multi-row change is one real transaction (item + blocks, note + labels, record + values).
- Backup = one file + one folder.

## Consequences
- **One replica only.** In-process state is correct only that way: login queue (`serial.ts`), rate limits, job runner (ADR-006). Two replicas = double sends + broken limits.
- Never hold a write transaction over network, file I/O or push (DESIGN §4). Upload streams to disk first, then one short txn (ADR-005).
- Heavy work stays off the request path: graph layout runs in the browser (ADR-007).
- Leaving SQLite = new ADR. Nothing in Keep/Pages needs it.
