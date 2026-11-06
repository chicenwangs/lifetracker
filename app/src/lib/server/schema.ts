// Drizzle mirror of TECHNICAL §4 SQL (SQL = truth). Tables:
// app_meta users sessions rate_limits invites
// calendars courses items blocks
// share_keys grants
// goals workout_split workout_logs places lists list_items people person_facts ideas step_templates
// search_fts (fts5 virtual -> raw SQL in a custom migration)
// PSEUDO per table: sqliteTable(name, cols, (t) => [indexes, checks])
//   booleans: integer({mode:'boolean'}) ; JSON text cols: text({mode:'json'}).$type<string[]>()
//   all CHECKs from §4 via check(): time GLOB, start_at LIKE '%Z', end_at > start_at, json_valid ...
//   partial unique: calendars_one_default ON (owner_id) WHERE is_default=1
