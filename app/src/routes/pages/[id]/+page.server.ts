import type { PageServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';
import * as dbs from '$lib/server/repo/databases';
import { ApiFail } from '$lib/server/http';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = ({ locals, params }) => {
	try {
		const uid = (locals.user as App.SafeUser).id;
		const rec = dbs.recordOfPage(uid, params.id);
		// a record's page shows its values above the editor (PG-RECORDS: same identity, not a copy)
		return {
			page: pages.get(uid, params.id),
			record: rec && { ...rec, ...dbs.getRecord(uid, rec.recordId) },
		};
	} catch (e) {
		if (e instanceof ApiFail && e.status === 404)
			error(404, { code: 'not_found', message: 'Page not found' });
		throw e;
	}
};
