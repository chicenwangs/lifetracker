// PSEUDO (FR-P3, P4, P5, P7) — pure, unit-tested
// isOpenNow(place, nowLocal{date, minutes, weekday}):
//   if open_when == [] -> 'unknown' (excluded from Open now)
//   for w in open_when:
//     Morning  06:00-12:00 today, not closed today
//     All Day  06:00-24:00 today, not closed today
//     Night    17:00-24:00 today (not closed today) OR 00:00-02:00 where PREV day not closed
//   closed_on == [] -> open daily
// applyFilters(places, f): city, openNow, notVisited, halal, approved, rating>=N, areas∩, cuisines∩, text contains
// pickRandom(list) -> crypto.randomInt
// dupKey(name) = lower, 'kafe'->'cafe', strip punctuation+spaces ; warn if same city + same key exists
