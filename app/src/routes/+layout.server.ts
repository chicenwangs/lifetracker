import type { LayoutServerLoad } from './$types';
import { parseHours } from '$lib/hours';
import * as grants from '$lib/server/repo/grants';
import * as itemTypes from '$lib/server/repo/itemtypes';
import * as pagesRepo from '$lib/server/repo/pages';

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	hours: parseHours(locals.user?.visibleHours ?? cookies.get('lt_hours')),
	user: locals.user,
	types: locals.user ? itemTypes.list(locals.user.id) : [],
	pins: locals.user ? pagesRepo.pins(locals.user.id) : [],
	// calendars shared with me (for the Overlap switch)
	shared: locals.user
		? grants
				.received(locals.user.id)
				.map((g) => ({ id: g.id, name: g.name, color: g.color, inOverlap: g.inOverlap }))
		: [],
});
