import type { LayoutServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';

export const load: LayoutServerLoad = ({ locals }) => ({
	tree: pages.tree((locals.user as App.SafeUser).id),
});
