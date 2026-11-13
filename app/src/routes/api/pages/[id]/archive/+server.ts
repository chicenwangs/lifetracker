// archive page + subpages: one undo entry (Ctrl+Z or the toast) brings them all back
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';
import { undoable } from '$lib/server/undo';

export const POST = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const title = pages.get(u.id, id, false).title || 'Untitled';
	const r = undoable(u.id, `Archive "${title}"`, pages.subtreeTargets(u.id, id), () => ({
		result: pages.archive(u.id, id),
	}));
	return json({ ...r.result, undo: r.undo });
});
