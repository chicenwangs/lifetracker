// POST {isTemplate} - the owner marks a page as a template (or stops). Journaled: toast Undo / Ctrl+Z flips it back.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import { need } from '$lib/server/repo/shares';
import * as pages from '$lib/server/repo/pages';
import { undoable } from '$lib/server/undo';

const schema = z.object({ isTemplate: z.boolean() }).strict();
export const POST = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const owner = need('page', u.id, id, 'owner'); // template pages are the owner's own
	const p = await body(e, schema);
	const r = undoable(
		u.id,
		p.isTemplate ? 'Make template' : 'Stop being a template',
		[{ t: 'pages', id }],
		() => ({ result: pages.update(owner, id, { isTemplate: p.isTemplate }, u.id) }),
	);
	return json({ page: r.result, undo: r.undo });
});
