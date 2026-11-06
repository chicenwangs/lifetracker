// PSEUDO — GET /api/calendar?from&to  (FR-H2, S10, NFR-1 < 100 KB)
// getCalendar(me, from, to):
//   accesses = listAccess(me, {overlapOnly:true})
//   for a in accesses:
//     items  = repo.items.inRange(a.calendarId, from, to)          // date<=to AND COALESCE(end_date,date)>=from
//     blocks = repo.blocks.inRange(a.calendarId, fromUtc, toUtc)   // start<to AND end>from
//     out = items.map(filterItem).compact , blocks.map(filterBlock).compact
//   own items also get steps_done/steps_total counts
//   return {me, others}
