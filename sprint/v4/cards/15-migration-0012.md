# Card 15 · db: migration 0012

- Source: BREAKDOWN PR 15 (lines 116–119) · PLAN §3E items 1, 6, 9 (lines 137, 142, 147), §6 v4.0 (line 214), §8 PR 15 (line 279) · DESIGN — (no screen) · decisions D-V4-09, D-V4-26 (migration method + evidence); O-3 is the consumer of the database-block rule, not this schema
- Needs: — · Size: S · Branch: `v4/15-migration-0012`

## What

One forward-only migration adds `pages.is_template` (0) and `pages.cover_attachment_id` (NULL, `ON DELETE SET NULL`) and rebuilds the small `reminders` table so `source_type` also accepts `page_todo`. No behaviour change: nothing reads the new columns until cards 22/30/31, and the rebuild keeps every existing reminder row with the same id, status and times.

Owner decisions that apply: **D-V4-09** (hand-written migration + snapshot like 0009/0010; evidence = gate on an empty DB, the v3.1.2 seed x200 and a new seed, plus one owner run on real data — SPRINT §1.1 forbids real data in agent work).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 New `app/drizzle/0012_v4_pages.sql` adds exactly two columns to `pages` and nothing else to that table: `is_template INTEGER NOT NULL DEFAULT 0` and `cover_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL`. No `DROP`, `RENAME` or copy of `pages`; its `pages_tree`/`pages_archived`/`pages_opened` indexes and `pages_title_len` CHECK are untouched.
- C2 The same file rebuilds `reminders` in one transaction (BREAKDOWN line 118): creates `reminders_new` with the same 17 columns and defaults, the same `owner_id` FK (`users(id) ON DELETE CASCADE`), the same `reminders_rule` and `reminders_status` CHECKs, and `reminders_source_type` now `IN ('planner_item','planner_block','keep_note','database_record','page_todo')`; `INSERT INTO reminders_new SELECT * FROM reminders`; `DROP TABLE reminders`; `ALTER TABLE reminders_new RENAME TO reminders`; recreates `reminders_due (status, due_at)` and `reminders_source (source_type, source_id)` with the same names.
- C3 After the upgrade every pre-existing `reminders` row has the same `id`, `status`, `due_at`, `at_time`, `attempts`, `sent_at`, `claimed_at` and `owner_id` (row count identical), and the two indexes exist with the same SQL as before.
- C4 `app/src/lib/server/schema.ts` mirrors the new state: `pages.isTemplate` (integer, boolean mode, `.notNull().default(false)` by convention of the file), `pages.coverAttachmentId` (text, `.references(() => attachments.id, { onDelete: 'set null' })`), `REMINDER_SOURCES` (line 650) gains `'page_todo'`; `app/drizzle/meta/0012_snapshot.json` (new) and `app/drizzle/meta/_journal.json` (one entry, idx 12) are hand-written like 0009/0010 (D-V4-09).
- C5 `app/src/lib/server/reminders.ts` `Source` union (line 14) gains `'page_todo'` as a type-only change; no behaviour, no new resolver (`sourceInfo` still returns undefined for it until card 30).
- C6 Empty DB: `migrateDb()` runs 0000–0012, `integrity_check` is `ok`, `foreign_key_check` is empty, a second `migrateDb()` changes nothing (`sprint/v4/scripts/migration-check.mjs` step 1).
- C7 Upgraded v3.1.2 seed (migration-check step 2, x200): `changedTables` is empty — row counts **and** ids identical in every old table, `reminders` included — integrity + FK clean and the second run a no-op (BREAKDOWN line 119 "reminder rows survive with the same ids and statuses").
- C8 Constraints are live after the upgrade: inserting a reminder with `source_type = 'page_todo'` succeeds; `'bogus'` is still refused by `reminders_source_type`; the `rule_kind` and `status` CHECKs still refuse bad values. Every `pages` row reads `is_template = 0` and `cover_attachment_id IS NULL`.
- C9 The cover FK is live: setting `pages.cover_attachment_id` to a real attachment id works; hard-deleting that `attachments` row sets it to NULL (`attachments.gc` hard-deletes, `attachments.ts:199-202`); a soft-deleted attachment (`deleted_at`) leaves the value in place.
- C10 Untouched on purpose: the `items_source` CHECK, the dormant v1 tables and `dormant.ts`, `page_blocks`/`page_links`/`page_shortcuts` FKs to `pages`, `push_subscriptions`, `undo_actions`.
- C11 No UI, no client change, no DTO field and no query filter: `tree()`/`recent()`/`search`/`graph` keep returning what they return today (the flag is 0 everywhere, so the sidebar cannot change), and a migration is not an undoable action (no journal row, no toast).
- C12 Tests: `app/tests/unit/schema.test.ts` and `app/tests/unit/migrate-snapshot.test.ts` stay green; a new in-memory test asserts the two columns with their defaults, the widened `reminders_source_type` check, and the cover FK set-null.
- C13 Docs: `docs/BUILD-NOTES.md` (one line: migration 0012 and its columns/value). The `docs/SERVICE-HANDOFF.md` v4.0.0 upgrade paragraph is card R1's. PROGRESS gains the plain note `owner: migration 0012 on a real-data copy before the tag` (the D-V4-26 form: no `NEEDS_OWNER` token); that one owner run also covers the owed 0009/0010 check from PLAN §5 item 9.

## Out of scope

- Any code that reads or writes `is_template` (card 22), `cover_attachment_id` (card 31) or `page_todo` reminders (card 30).
- `attachment_refs` counting for a cover (card 31) and the `schema_version` bump on `page_blocks`.
- An index on `is_template` (card 22 adds one only if its query needs it).
- Seeding a template, creating a cover, or changing `pages` DTO fields.
- Editing `sprint/v4/scripts/migration-check.mjs` or the judge copy under `bin/`.

## Files likely touched

- `app/drizzle/0012_v4_pages.sql` (new)
- `app/drizzle/meta/0012_snapshot.json` (new)
- `app/drizzle/meta/_journal.json`
- `app/src/lib/server/schema.ts` (`pages` 454–484, `REMINDER_SOURCES` 650, `reminders` 651–687, `attachments` 284–304 as the FK target)
- `app/src/lib/server/reminders.ts` (`Source` union line 14)
- `app/src/lib/server/db.ts` (no change expected; `migrateDb` 34–45 already turns FKs off for a rebuild)
- `app/package.json` (`db:generate` script, line 17; reference only, see Tests)
- `app/tests/unit/schema.test.ts`, `app/tests/unit/migrate-snapshot.test.ts`, `app/tests/unit/v4-15-migration.test.ts` (new)
- `sprint/v4/scripts/migration-check.mjs` (read-only reference; the judge copy in `bin/` runs in the gate)

## Tests

- Builder: `app/tests/unit/v4-15-migration.test.ts` migrates an in-memory DB and asserts the columns/defaults, the widened reminders CHECK and the set-null FK; `schema.test.ts` + `migrate-snapshot.test.ts` stay green (the snapshot test skips on CI, no snapshot — `it.skipIf`). Migration cards run the `site` gate (SPRINT §4 step 4), which includes `migration-check.mjs` (empty, v3.1.2 seed x200, new seed).
- Builder note (not a Done-when): `npm run db:generate` from the new schema has no pending changes (it needs the drizzle CLI on a Node 22 machine, so it does not gate the card).
- Blind (tester, from Done when only): `app/tests/unit/v4-15-blind.test.ts`.

## Docs

- `docs/BUILD-NOTES.md`; `docs/SERVICE-HANDOFF.md` is card R1's release-upgrade text.

## Decided

- Decided: D-V4-09 (method) — hand-written migration + snapshot like 0009/0010; evidence = the gate on an empty DB, the v3.1.2 seed x200 and a new seed, plus the owner's real-data run.
- Decided: D-V4-26 (applied to 0012) — the `db:generate` check is a builder note, not a Done-when; the snapshot test skips on CI; the real-data run is a plain PROGRESS note `owner: migration 0012 on a real-data copy before the tag`, not a `NEEDS_OWNER` token.
