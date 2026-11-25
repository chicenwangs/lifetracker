// POST /api/pages/:id/duplicate — a copy owned by the caller, no shares. Undo = the copy goes away.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { need } from '$lib/server/repo/shares';
import { duplicatePage } from '$lib/server/repo/page-duplicate';
import { undoable } from '$lib/server/undo';

export const POST = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const owner = need('page', u.id, id); // a viewer may copy what they can already read
	const r = undoable(u.id, 'Duplicate page', [], () => {
		const page = duplicatePage(u.id, owner, id);
		return { result: page, created: [{ t: 'pages' as const, id: page.id }] };
	});
	return json({ page: r.result, undo: r.undo }, { status: 201 });
});
