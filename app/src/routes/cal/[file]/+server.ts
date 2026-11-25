// GET /cal/<token>.ics: read-only ICS feed, no login (hooks PUBLIC). Unknown token = the normal 404.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { icsFeed } from '$lib/server/icsfeed';
import * as rl from '$lib/server/ratelimit';
import * as users from '$lib/server/repo/users';

export const GET: RequestHandler = ({ params, getClientAddress }) => {
	const key = `ics:${rl.ipKey(getClientAddress())}`;
	if (rl.check(key).locked) return new Response('Too many requests', { status: 429, headers: { 'retry-after': '900' } }); // prettier-ignore
	rl.fail(key, 120); // every fetch counts: the 120th in 15 min is served and locks, the 121st gets 429 (calendar apps poll every few hours)
	const m = /^([A-Za-z0-9_-]{43})\.ics$/.exec(params.file ?? '');
	const u = m?.[1] ? users.byIcsToken(m[1]) : undefined;
	if (!u) error(404, { code: 'not_found', message: 'Not found' });
	return new Response(icsFeed(users.safe(u)), {
		headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' },
	});
};
