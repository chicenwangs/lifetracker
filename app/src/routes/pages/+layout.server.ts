import type { LayoutServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';

export const load: LayoutServerLoad = ({ locals }) => {
	const id = (locals.user as App.SafeUser).id;
	return { tree: pages.tree(id), templates: pages.templates(id), recent: pages.recent(id) };
};
