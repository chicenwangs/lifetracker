// GET tree (live, not archived) / POST {parentId?, title?} new page (journalled: one undo removes it)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';
import { undoable } from '$lib/server/undo';

export const GET = api((e) => json({ tree: pages.tree(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	const p = await body(e, pages.createSchema);
	const r = undoable(u.id, 'Create page', [], () => {
		const page = pages.create(u.id, p);
		return { result: page, created: [{ t: 'pages' as const, id: page.id }] };
	});
	return json({ page: r.result, undo: r.undo }, { status: 201 });
});
