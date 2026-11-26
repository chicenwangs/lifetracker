# Card 08 · db: migration 0011

- Source: BREAKDOWN PR 8 (lines 61–64) · PLAN §6 v3.3 (line 202), §5 item 9 (line 185), §8 PR 8 (line 265) · DESIGN — (no screen) · decisions O-1 items 1–2, 5 (the columns' consumers), D-V4-09, D-V4-26
- Needs: — · Size: S · Branch: `v4/08-migration-0011`

## What

One forward-only migration adds the four columns v3.3 needs, with no behaviour change: `items.repeat_from_completion` (0), `items.ics_uid` (NULL) plus a partial unique index, `item_types.on_calendar` (1) and `users.digest_time` (NULL = off). ADD COLUMN only — no table rebuild, so `users` keeps its hand-patched `COLLATE NOCASE` and `items` keeps its CHECKs. Cards 09–12 read the columns; this card writes none of their logic.

Owner decisions that apply: none directly. The defaults keep old behaviour for every existing row (`O-1` items 1–2, 5 describe what the columns later drive).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 New `app/drizzle/0011_v33_columns.sql` contains exactly four `ALTER TABLE ... ADD COLUMN` statements, no `DROP`, `RENAME`, `CREATE TABLE` or table copy: `items.repeat_from_completion INTEGER NOT NULL DEFAULT 0`, `items.ics_uid TEXT`, `item_types.on_calendar INTEGER NOT NULL DEFAULT 1`, `users.digest_time TEXT DEFAULT NULL CHECK (digest_time IS NULL OR digest_time GLOB '[0-2][0-9]:[0-5][0-9]')`.
- C2 The same migration creates the partial unique index `CREATE UNIQUE INDEX items_ics_uid ON items (calendar_id, ics_uid) WHERE ics_uid IS NOT NULL AND deleted_at IS NULL` (amends D-V4-09: a trashed row must not block a re-import), and changes nothing else.
- C3 `app/src/lib/server/schema.ts` mirrors all four columns with the same defaults (`integer` boolean mode for the two flags; `text` otherwise); `app/drizzle/meta/0011_snapshot.json` and `app/drizzle/meta/_journal.json` (one new entry, idx 11) are hand-written like 0009/0010 (D-V4-09).
- C4 On an empty DB, `migrateDb()` (`app/src/lib/server/db.ts:34`) runs 0000–0011, `integrity_check` is `ok`, `foreign_key_check` is empty, and a second `migrateDb()` changes nothing. The same holds on the v3.1.2-seeded DB and on a new seed (`sprint/v4/scripts/migration-check.mjs` steps 1–3). PROGRESS gains the plain note `owner: migration 0011 on a real-data copy before the tag` (no `NEEDS_OWNER` token); that one owner run also covers the owed 0009/0010 check (D-V4-09).
- C5 Existing rows get the old behaviour: after the upgrade every `items` row has `repeat_from_completion = 0` and `ics_uid IS NULL`, every `item_types` row has `on_calendar = 1`, every `users` row has `digest_time IS NULL`; row counts and ids in every old table are unchanged (migration-check's `changedTables` is empty). Because migration-check compares only counts/hashes, the v3.1.2 upgrade seed's column values are asserted by `app/tests/unit/v4-08-migration.test.ts` instead.
- C6 Untouched on purpose: the `items_source` CHECK still allows only `'notion'` (`schema.ts:215`) — imported rows stay `source = NULL` and are identified by `ics_uid` (PLAN §6 line 203); dormant tables (`courses`, `goals`, `workout_*`, `lists`, `people`, `places`, `ideas`, `step_templates`) are not dropped; `app/src/lib/server/dormant.ts` needs no edit (it only reads v1 tables and writes Keep).
- C7 `app/tests/unit/schema.test.ts` and `app/tests/unit/migrate-snapshot.test.ts` stay green — the snapshot test skips on CI (no snapshot, `it.skipIf`); the new columns appear once in `PRAGMA table_info` for their tables with the defaults above (a unit test can assert this on an in-memory DB).
- C8 Phone path: none — no UI, no client change. Undo: none — no mutation. States (DESIGN §3): none — no screen, no loading/empty/error surface. Sharing: none — no access rule changes.
- C9 Docs: `docs/BUILD-NOTES.md` (one line: migration 0011 and the four columns); the `docs/SERVICE-HANDOFF.md` upgrade paragraph for v4.0.0 belongs to card R1.

## Out of scope

- Any code that reads or writes the columns (cards 09–12).
- A `deleted_batch`, an index rebuild, or a table rebuild.
- `items.source` gaining an `'ics'` / `'import'` value, or new `reminders.source_type` values.
- Seeding `digest_time` or turning on any preset.
- The owed 0009/0010 real-data check is an owner action (D-V4-09), not agent work.

## Files likely touched

- `app/drizzle/0011_v33_columns.sql` (new)
- `app/drizzle/meta/0011_snapshot.json` (new)
- `app/drizzle/meta/_journal.json`
- `app/src/lib/server/schema.ts` (`items`, `itemTypes`, `users`; CHECK comments at 92–94 and 205–216)
- `app/src/lib/server/db.ts` (no change expected; `migrateDb` already runs the folder)
- `app/package.json` (`db:generate` script exists; reference only, see Tests)
- `app/tests/unit/schema.test.ts`, `app/tests/unit/migrate-snapshot.test.ts`
- `app/tests/unit/v4-08-migration.test.ts` (new)
- `sprint/v4/scripts/migration-check.mjs` (read-only reference; the judge copy is used by the gate)

## Tests

- Builder: `app/tests/unit/v4-08-migration.test.ts` migrates an in-memory DB and asserts the four columns, their defaults and the index predicate, then migrates the v3.1.2 upgrade seed and asserts the four column values of C5; `app/tests/unit/schema.test.ts` and `app/tests/unit/migrate-snapshot.test.ts` stay green. Migration cards run the `site` gate (SPRINT §4 step 4), which includes `migration-check.mjs`.
- Builder note (not a Done-when): `npm run db:generate` from the new schema has no pending changes (it needs the drizzle CLI on a Node 22 machine, so it does not gate the card).
- Blind (tester, from Done when only): `app/tests/unit/v4-08-blind.test.ts`.

## Docs

- `docs/BUILD-NOTES.md`; `docs/SERVICE-HANDOFF.md` is card R1's release-upgrade text.

## Decided

- Decided: D-V4-09 — partial UNIQUE index on (calendar_id, ics_uid) where ics_uid is not null; loose `HH:MM` CHECK like `items.time` (`zTime` guards writes); hand-written 0011 + snapshot (0009/0010 pattern); evidence = the gate (empty + v3.1.2 ×200 + new seed) plus the owner note for a real-data copy, which also covers the owed 0009/0010 check.
- Decided: D-V4-26 — the `db:generate` clause is a builder note, not a Done-when; the snapshot test skips on CI; the upgrade seed's new column values are asserted in `v4-08-migration.test.ts`; the real-data run is a plain PROGRESS note, not `NEEDS_OWNER`; the index predicate also excludes trashed rows (amends D-V4-09).
