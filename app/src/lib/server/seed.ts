// PSEUDO (FR-IM1..3, TECHNICAL §10)
// importSeed(dir, ownerUsername):
//   files = items blocks courses goals workout_split places lists list_items people person_facts ideas
//   for f: rows = zod.array(schema[f]).parse(json) -> on fail throw `${f}[${idx}]: ${issue}`
//   owner = users.byUsername ; cal = default calendar
//   remap all: 'usr_jeremy' -> owner.id ; 'cal_jeremy_main' -> cal.id
//   convert bools 0/1, arrays -> JSON text, fill created_at/updated_at = now if missing
//   tx:
//     for each table in FK order (courses, items(parents first), blocks, ...):
//       INSERT ... ON CONFLICT(id) DO UPDATE SET <seed fields> WHERE excluded.updated_at >= table.updated_at
//       (skip rows edited in app after import)
//     rebuildFts(owner.id)
//     counts vs _report.json counts -> mismatch -> throw (rollback)
//   return {counts, warnings: report.warnings}
// readReport(dir) -> parse _report.json
