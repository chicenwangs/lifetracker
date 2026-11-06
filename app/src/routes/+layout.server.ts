import type { LayoutServerLoad } from './$types';
import * as courses from '$lib/server/repo/courses';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user,
	courses: locals.user
		? courses.active(locals.user.id).map((c) => ({ id: c.id, code: c.code, aliases: c.aliases }))
		: [],
});
