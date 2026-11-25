# PR 8 — migration 0011 (v3.3 columns)

- User: nothing visible yet. The four new columns are for PR 9 (`repeat_from_completion`), PR 10
  (`item_types.on_calendar`), PR 11 (`items.ics_uid` + index) and PR 12 (`users.digest_time`). Every default is the
  v3.2 behaviour, so an untouched install behaves exactly as before.
- Migration: `drizzle/0011_v4_flags.sql` — ADD COLUMN only, no table rebuild:
  `item_types.on_calendar` INTEGER NOT NULL DEFAULT 1 · `items.repeat_from_completion` INTEGER NOT NULL DEFAULT 0 ·
  `items.ics_uid` TEXT · INDEX `items_cal_ics (calendar_id, ics_uid)` · `users.digest_time` TEXT with
  `CHECK (digest_time IS NULL OR digest_time GLOB '[0-1][0-9]:[0-5][0-9]' OR digest_time GLOB '2[0-3]:[0-5][0-9]')`
  (NULL = off; 00:00-23:59 only).
  Snapshot `drizzle/meta/0011_snapshot.json`, journal entry `0011_v4_flags`; `db:generate` after this says
  "No schema changes".
- Files: `app/drizzle/0011_v4_flags.sql`, `app/drizzle/meta/0011_snapshot.json`, `app/drizzle/meta/_journal.json`,
  `app/src/lib/server/schema.ts`, `app/tests/unit/schema.test.ts`.
- Tests: unit 429 passed, 1 skipped (2 new: columns/defaults/digest CHECK/ics index, and migrator twice on an empty
  DB) · `migrate-snapshot.test.ts` with `LT_SNAPSHOT` = a copy of the W2 QA DB (v1 table row counts unchanged,
  integrity + foreign_key ok, block links kept, item_types = users × 5) · lint + check clean.
- Docs to change later: `docs/SERVICE-HANDOFF.md` upgrade section (two migrations 0011 + 0012, backup first,
  rollback needs restore) — RC phase.
