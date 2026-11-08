import type { LayoutServerLoad } from './$types';
import { parseHours } from '$lib/hours';
import * as grants from '$lib/server/repo/grants';

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	hours: parseHours(cookies.get('lt_hours')),
	user: locals.user,
	// calendars shared with me (for the Overlap switch)
	shared: locals.user
		? grants
				.received(locals.user.id)
				.map((g) => ({ id: g.id, name: g.name, color: g.color, inOverlap: g.inOverlap }))
		: [],
});
