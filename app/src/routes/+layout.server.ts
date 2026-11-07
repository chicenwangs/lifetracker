import type { LayoutServerLoad } from './$types';
import { parseHours } from '$lib/hours';

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	hours: parseHours(cookies.get('lt_hours')),
	user: locals.user,
});
