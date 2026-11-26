// POST {parentId} - new page from a template (or any readable page): PR 17's copier, "Untitled <name>".
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import { need } from '$lib/server/repo/shares';
import * as pages from '$lib/server/repo/pages';
import { duplicatePage } from '$lib/server/repo/page-duplicate';
import { undoable } from '$lib/server/undo';

const schema = z.object({ parentId: z.string().max(40).nullable().default(null) }).strict();
export const POST = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const owner = need('page', u.id, id); // any page they can read can seed their own copy
	const p = await body(e, schema);
	const src = pages.get(owner, id, false, u.id);
	const r = undoable(u.id, 'New from template', [], () => {
		const page = duplicatePage(u.id, owner, id, {
			title: `Untitled ${src.title.trim() || 'page'}`,
			parentId: p.parentId,
			isTemplate: false,
		});
		return { result: page, created: [{ t: 'pages' as const, id: page.id }] };
	});
	return json({ page: r.result, undo: r.undo }, { status: 201 });
});
