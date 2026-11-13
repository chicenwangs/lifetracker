// POST {pageId?, title?}: new database as a block on a page I own, or on a new page of its own
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

const schema = z
	.object({ pageId: z.string().max(40).nullable().default(null), title: z.string().max(300).default('') })
	.strict();
export const POST = api(async (e) =>
	json({ database: dbs.create(me(e).id, await body(e, schema)) }, { status: 201 }),
);
