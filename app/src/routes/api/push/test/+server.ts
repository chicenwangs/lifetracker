// Settings › Notifications "Send a test". Says "sent" only when a push service accepted it (never "delivered").
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { pushTo } from '$lib/server/jobs';
import * as rl from '$lib/server/ratelimit';

export const POST = api(async (e) => {
	const u = me(e);
	const key = `pushtest:${u.id}`;
	const lim = rl.check(key);
	if (lim.locked) return json({ error: { code: 'rate_limited', message: `Too many tests. Try again in ${lim.minutesLeft} min.` } }, { status: 429 }); // prettier-ignore
	rl.fail(key, 5); // every test counts: 5 per 15 min
	return json(await pushTo(u.id, { title: 'Test from Life Tracker', body: 'Push works on this device.', route: '/settings/notifications' })); // prettier-ignore
});
