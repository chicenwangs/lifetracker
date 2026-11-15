// POST: the record's page (made on first open, same page every time after). Making it needs edit access.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';
import { needRecord } from '$lib/server/repo/shares';

export const POST = api((e) => {
	const uid = me(e).id;
	const id = e.params.id ?? '';
	return json({ pageId: dbs.recordPage(needRecord(uid, id), id, () => needRecord(uid, id, 'edit')) });
});
