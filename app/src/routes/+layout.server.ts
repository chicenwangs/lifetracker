import type { LayoutServerLoad } from './$types';
import * as courses from '$lib/server/repo/courses';
import { parseHours } from '$lib/hours';

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	hours: parseHours(cookies.get('lt_hours')),
	user: locals.user,
	courses: locals.user
		? courses.active(locals.user.id).map((c) => ({ id: c.id, code: c.code, aliases: c.aliases }))
		: [],
});
