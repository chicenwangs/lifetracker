// GET page + doc · PATCH {title?, icon?, doc?, revision?} · DELETE = Trash (page + subpages, 30 d, restorable)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';
import { syncTitleFromPage } from '$lib/server/repo/databases';
import { need } from '$lib/server/repo/shares';
import { undoable } from '$lib/server/undo';

export const GET = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const owner = need('page', u.id, id);
	return json({ page: pages.get(owner, id, true, u.id) });
});
export const PATCH = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const owner = need('page', u.id, id, 'edit');
	const p = await body(e, pages.patchSchema);
	// a cover-only PATCH is one undo entry (doc saves use the editor's own history); v4.0 PR 31
	const page =
		p.coverAttachmentId !== undefined && p.doc === undefined
			? undoable(u.id, p.coverAttachmentId ? 'Page cover' : 'Cover removed', [{ t: 'pages', id }], () => ({
					result: pages.update(owner, id, p, u.id),
				})).result
			: pages.update(owner, id, p, u.id);
	if (p.title !== undefined) syncTitleFromPage(page.id, p.title); // record page: the title value follows
	return json({ page });
});
export const DELETE = api((e) => json(pages.trash(me(e).id, e.params.id ?? '')));
