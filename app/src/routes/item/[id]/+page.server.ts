import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { itemView } from '$lib/server/itemview';
import { ApiFail } from '$lib/server/http';

// Full-page fallback (direct link / reload). Clicks in the calendar open the same view as a centre peek.
export const load: PageServerLoad = ({ locals, params }) => {
	try {
		return { view: itemView(locals.user as App.SafeUser, params.id) };
	} catch (e) {
		if (e instanceof ApiFail && e.status === 404) error(404, { code: 'not_found', message: 'Not found' });
		throw e;
	}
};
