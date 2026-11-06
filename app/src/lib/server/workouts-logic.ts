// PSEUDO (FR-W3..W5)
// todaySplit(me) = workout_split WHERE weekday = weekdayOf(today) ORDER sort
// prefillKg(exercise) = last log weight_kg ?? split.current_kg
// progress(me) = last 4 ISO weeks (incl current) via isoWeekKey -> max kg per exercise per week
//              + legacy_weeks shown as 'Before app'
// logSession(me, date, logs[]): tx insert logs ; block = today's block where lower(label)='workout' -> status done
