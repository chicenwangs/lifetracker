// PSEUDO (FR-F1, P3)
// rotateToken(me): raw = sessionToken() ; users.ics_token_hash = hmac(raw) ; return ORIGIN+'/cal/'+raw+'.ics'
// buildIcs(token): user = byIcsHash(hmac(token)) else 404
//   own items (not deleted, date not null). all-day -> DTSTART;VALUE=DATE, end_date+1
//   timed -> local tz TZID ; 1h default ; UID = item.id@lt ; escape , ; \n ; fold 75
