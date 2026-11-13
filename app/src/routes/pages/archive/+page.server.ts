import type { PageServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';

export const load: PageServerLoad = ({ locals }) => {
	const me = (locals.user as App.SafeUser).id;
	return { archived: pages.archived(me), suggestions: pages.suggestions(me) };
};
