// POST: the record's page (made on first open, same page every time after)
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';
import { needRecord } from '$lib/server/repo/shares';

export const POST = api((e) =>
	json({ pageId: dbs.recordPage(needRecord(me(e).id, e.params.id ?? ''), e.params.id ?? '') }),
);
