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
	// v4.0 PR 22: isTemplate is owner-level; the generic PATCH only needs edit, so check it here too
	if (p.isTemplate !== undefined) need('page', u.id, id, 'owner');
	// the cover is an owner-level field (v4.0 PR 31); the UI hides Change/Remove for shared editors
	if (p.coverAttachmentId !== undefined) need('page', u.id, id, 'owner');
	// one small metadata change = one undo entry: cover (PR 31) or icon (PR 16)
	const coverField = p.coverAttachmentId !== undefined;
	const tiny = p.doc === undefined && p.title === undefined && (p.icon !== undefined || coverField);
	const r = tiny
		? undoable(
				u.id,
				coverField ? (p.coverAttachmentId ? 'Page cover' : 'Cover removed') : 'Page icon',
				[{ t: 'pages', id }],
				() => ({ result: pages.update(owner, id, p, u.id) }),
			)
		: { result: pages.update(owner, id, p, u.id), undo: undefined };
	if (p.title !== undefined) syncTitleFromPage(r.result.id, p.title); // record page: the title value follows
	return json({ page: r.result, undo: r.undo });
});
export const DELETE = api((e) => json(pages.trash(me(e).id, e.params.id ?? '')));
