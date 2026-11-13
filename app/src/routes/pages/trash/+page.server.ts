import type { PageServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';

export const load: PageServerLoad = ({ locals }) => ({
	trashed: pages.trashed((locals.user as App.SafeUser).id),
});
