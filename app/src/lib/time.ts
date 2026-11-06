// ONLY place for date/tz math. Uses date-fns + @date-fns/tz TZDate. Never new Date('YYYY-MM-DD').
// PSEUDO
// todayLocal(tz) -> 'YYYY-MM-DD'                        TZDate.now(tz) format
// nowUtcIso() -> 'YYYY-MM-DDTHH:MM:SSZ'
// addDays(date, n) -> date string (pure calendar math, no tz)
// weekdayOf(date) -> 1..7 (Mon=1)
// isoWeekKey(date) -> 'YYYY-Www'                         getISOWeekYear + getISOWeek (2027-01-02 -> 2026-W53)
// quarterKey(date) -> 'YYYY-Qn'
// monthGridRange(year, month) -> {from, to}             Monday-start, 6 rows
// --- FullCalendar mapping ---
// itemToFc(item): start = time ? date+'T'+time : date ; allDay = !time
//                 end = end_date ? addDays(end_date, 1) : undefined   (FC end exclusive)
// fcToItemPatch(fcEvent): date = startStr[0..10] ; end_date = end ? addDays(endStr,-1) : null ; time kept
// --- blocks (UTC instants <-> local) ---
// localToUtc(date, 'HH:MM', tz) -> ISO Z
// utcToLocal(iso, tz) -> {date, time, minutesOfDay}
// dayBoundsUtc(date, tz) -> [startZ, nextStartZ)
// clipBlockToDay(block, date, tz) -> {top_min, bottom_min, clippedStart, clippedEnd} | null   (midnight cross)
// snap15(min) -> round(min/15)*15 ; fixRange(s,e): if e<=s then e=s+15
// durationMin(startZ, endZ)
