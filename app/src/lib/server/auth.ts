// PSEUDO (FR-A1..A12, TECHNICAL §5)
// cookieName = env.secureCookies ? '__Host-lt_session' : 'lt_session'
// hashPassword(p) = argon2id(memoryCost 19456, timeCost 2, parallelism 1)
// verifyPassword(hash|null, p): hash null -> verify DUMMY_HASH (timing) -> false
// passwordRule = zod string 10..128 refine(!COMMON.has(lower))            (common-passwords.txt)
//
// createSession(userId, remember, ua, ip, cookies):
//   token = sessionToken(); sid = sha256hex(token); now
//   remember ? expires now+30d, absolute now+90d : expires now+12h, absolute now+7d
//   insert sessions ; cookies.set(name, token, {httpOnly, sameSite:'lax', path:'/', secure, maxAge: remember?30d:undefined})
//
// loadSession(cookies):
//   token = cookie ; none -> null
//   row = sessions JOIN users WHERE id = sha256hex(token) AND password_hash NOT NULL
//   if !row or expires_at<now or absolute<now -> delete row, clear cookie, null
//   return {user: safe(row), session: row}
//
// slide(session, cookies):  if last_seen_at < now-5min:
//   remember & (expires-now) < 15d -> expires = min(now+30d, absolute) ; reset cookie maxAge
//   !remember -> expires = min(now+12h, absolute)
//   last_seen_at = now
//
// login(username, password, remember, ip, ua, cookies, oldToken):
//   u = trim lower
//   if ratelimit locked 'login:u:u|ip' or 'login:ip:ip' -> {429, 'Too many tries. Try again in M min'}
//   if fails('login:u:u') > 20 -> await sleep 2s
//   user = users.byUsername(u) ; ok = verifyPassword(user?.password_hash ?? null, password)
//   if !ok -> fail all 3 keys ; return 'Wrong username or password. N tries left.'
//   clear 'login:u:u|ip' ; if oldToken delete that session (fixation)
//   if needsRehash -> update hash ; createSession
//
// safeNext(next) -> next if /^\/(?![\/\\])/ and new URL(next, ORIGIN).origin == ORIGIN else '/'
// logout(session) delete row + clear cookie
// revokeOthers(userId, currentSid) ; listSessions(userId) ; revokeOne(userId, sid)
// changePassword(user, current, next): verify -> new hash -> delete others -> rotate current (new token)
