import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { getCalendar } from '$lib/server/calendar';

export const GET = api((e) => {
	const u = me(e);
	return json(getCalendar(u, e.url.searchParams.get('from') ?? '', e.url.searchParams.get('to') ?? ''));
});
