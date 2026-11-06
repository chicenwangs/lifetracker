// PSEUDO — shared types (client + server)
// Type = 'Work'|'Exam'|'Event'|'Hobby'|'Dating'      TypeKey = Type | 'None'
// Status = 'todo'|'doing'|'done'
// ItemDTO   = { id, title, type|null, status, date|null, time|null, end_date|null, course_id?, parent_id?,
//               private?, steps_done?, steps_total?, theirs?: true, ownerColor?, ownerInitial?, editable }
// BusyDTO   = { id:'busy_..', busy:true, title:'Busy', type:null, date, time, end_date }
// BlockDTO  = { id, label, type|null, start_at, end_at, status, item_id?, theirs?, editable }
// CalendarPayload = { me: {items, blocks}, others: [{calendarId, owner:{name,initial,color}, permission, items, blocks}] }
// ApiError = { error: { code, message } }
