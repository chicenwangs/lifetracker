// GET {given: who sees mine, received: calendars I see}
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as grants from '$lib/server/repo/grants';

export const GET = api((e) => {
	const u = me(e);
	return json({ given: grants.given(u.id), received: grants.received(u.id) });
});
