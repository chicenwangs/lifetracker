# ADR-004 — database record model

Status: **Accepted** (2026-11-13). Design only, **no spike**. Schema = DESIGN §5, rules = DESIGN §7.

## Decision
- Database = rows, not JSON: `page_databases` → `database_properties` → `database_records` → `database_values (record, property, value_json)`.
- 8 property types (title, text, number, date, checkbox, select, multi_select, url). One `title` per database.
- Select options live in the property's `config_json` as `{id,label,color}`. Values store option **ids**, so a rename touches one row.
- A record's page is created on first open, in the same txn.
- Filters and sorts come only from a validated view config, mapped to known properties and operators. No column names or SQL from the client.
- Page size default 100, max 500. Small databases may filter/sort in app code after a bounded load.

## Why
- Adding or removing a property = rows, not a table migration per user database.
- One value = one small row: validation per type, no rewriting a big JSON on each cell edit.

## Consequences
- Sorting by a value needs a join per sorted property. OK at the bounded page size. If a database grows past a few thousand records: add an indexed projection, new ADR.
- Type change with bad values = D-19 (open, needed by P4). Not decided here.
- Relations and formulas are out (DESIGN §7: later, own spec).
