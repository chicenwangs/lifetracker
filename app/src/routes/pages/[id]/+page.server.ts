import type { PageServerLoad } from './$types';
import * as pages from '$lib/server/repo/pages';
import * as dbs from '$lib/server/repo/databases';
import { ApiFail } from '$lib/server/http';
import { need } from '$lib/server/repo/shares';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = ({ locals, params }) => {
	try {
		const uid = (locals.user as App.SafeUser).id;
		const owner = need('page', uid, params.id); // mine, or shared with me
		const rec = dbs.recordOfPage(owner, params.id);
		// a record's page shows its values above the editor (PG-RECORDS: same identity, not a copy)
		return {
			page: pages.get(owner, params.id, true, uid),
			record: rec && { ...rec, ...dbs.getRecord(owner, rec.recordId) },
		};
	} catch (e) {
		if (e instanceof ApiFail && e.status === 404)
			error(404, { code: 'not_found', message: 'Page not found' });
		throw e;
	}
};
