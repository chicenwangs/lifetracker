# v3.2 PR 7 · ICS export (#388)

User: Settings › Calendar feed. "Create feed link" shows a secret URL once (Copy · Rotate · Turn off).
Paste it into Google/Apple Calendar/Outlook as a subscribed calendar. Own items only, today −30 d … +365 d.
Private items = "Busy". Repeats = one VEVENT with RRULE + EXDATE. Timed items: TZID + VTIMEZONE, 60 min or the
linked block's length. All-day = VALUE=DATE. Hidden types left out. Planner blocks and shared calendars not exported.

Files:
- `lib/server/ics.ts` pure ICS text (escape, 75-octet fold, VTIMEZONE, RRULE/UNTIL typing)
- `lib/server/icsfeed.ts` feed content; `repo/items.ts feedRows` (series unexpanded + linked block minutes)
- `repo/users.ts` newIcsToken / clearIcsToken / byIcsToken (32 random bytes, sha256 in `users.ics_token_hash`)
- `routes/cal/[file]/+server.ts` GET /cal/<token>.ics; `routes/api/me/ics` POST create/rotate, DELETE off
- `routes/settings/calendar` page; `settings-sections.ts` entry (group Planner)
- `hooks.server.ts`: /cal/*.ics public; error log masks the token path

Not agenda(): the feed needs series unexpanded and a 395-day window (getCalendar caps 62 days).
No undo for Rotate/Turn off (old token hash is gone); both ask to confirm instead.

Tests: unit `ics.test.ts` (9: escaping, folding, all-day, TZID/VTIMEZONE, DST zone, private, RRULE/UNTIL/EXDATE,
token rotate/disable, feed scoping/window/hidden/block length) · e2e desktop flow "ICS feed…" · phone settings
list + Calendar feed page (48 dp, no desktop words).

Doc lines:
- SERVICE-HANDOFF: new unauthenticated GET `/cal/<token>.ics`, rate limit 120 / 15 min / IP (rate_limits key
  `ics:<ip>`), `Cache-Control: private, max-age=300`, no outbound calls, no new env. Token = secret in the URL:
  it can appear in proxy/tunnel access logs; app error log masks it.
- FEATURES: Settings › Calendar feed. AGENTS/BUILD-NOTES: routes list gets /cal and /api/me/ics.
