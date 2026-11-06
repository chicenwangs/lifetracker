// Shared parser (pure). Client imports for preview (FR-Q2). Server re-parses = truth.
// (TECHNICAL lists it under lib/server; moved here so client can import. Must stay pure: no db, no env.)
//
// parseQuickAdd(text, ctx:{today, nowMinutes, courses:[{id, aliases[]}]}) ->
//     { ok, title, date, time, type, course_id, warnings[] } | { ok:false, reason }
//
// PSEUDO
// tokens = text.trim().split(/\s+/)
// used = Set()
// for i, tok in tokens:
//   low = tok.toLowerCase()
//   if low starts '!' and low.slice(1) in TYPE_WORDS: type = map(!date|!dating->Dating ...) ; used.add(i)
//   if low starts '#' and alias match whole: course = c ; used.add(i)         // '#spot' unknown -> stays title
// dateHits = []                                       // collect, LAST wins
// for i: match in order:
//   'today' | 'tmr' | 'tomorrow'
//   weekday short/full (whole token only; 'Sun' in 'Sun Tzu' IS a token -> ambiguity rule:
//        weekday counts only if it is the LAST date token AND not followed by a capitalised word) **
//   D MON / MON D   (two tokens; bare 'may' only next to number)
//   D/M  (day/month always)
//   YYYY-MM-DD
//   -> dateHits.push({i | [i,i+1], date})
// if dateHits: take last -> used.add(its idx)
// time: first token matching ^(\d{1,2})(:(\d{2}))?(am|pm)$ | ^([01]?\d|2[0-3])[:.](\d{2})$
//       (token must be whole: 'v1.30' fails regex) -> used.add
// rollover:
//   weekday: next occurrence incl today ; if today and time given and time <= now -> +7
//   D MON, D/M: this year ; if < today -> next year
//   none: today ; if time passed -> warning 'time already passed today'
// type default: course ? 'Work' : 'Event'
// title = tokens not in used joined ' ' trimmed ; empty -> {ok:false, reason:'need a title'}
// ** decision for impl: test table decides; 'Sun Tzu reading tmr' -> date tmr (last), title 'Sun Tzu reading'
