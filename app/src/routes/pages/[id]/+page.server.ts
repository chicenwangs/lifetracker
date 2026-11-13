import type { PageServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';
import { ApiFail } from '$lib/server/http';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = ({ locals, params }) => {
	try {
		return { page: pages.get((locals.user as App.SafeUser).id, params.id) };
	} catch (e) {
		if (e instanceof ApiFail && e.status === 404)
			error(404, { code: 'not_found', message: 'Page not found' });
		throw e;
	}
};
