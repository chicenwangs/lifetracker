// PSEUDO — POST /api/quickadd {text}
// ctx = {today: todayLocal(me.tz), nowMinutes, courses: repo.courses.active(me)}
// r = parseQuickAdd(text, ctx) ; !r.ok -> 400
// item = repo.items.create(me, {title, type, date, time, course_id}) ; return {item, warnings}
