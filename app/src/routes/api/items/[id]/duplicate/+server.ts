// Alt-drag copy (FEATURES §3, D-09): new item at the target date, one undo entry.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { zDate } from '$lib/server/validate';
import { undoable } from '$lib/server/undo';

export const POST = api(async (e) => {
	const u = me(e);
	const { date } = await body(e, z.object({ date: zDate }).strict());
	const src = items.mustOwn(u.id, e.params.id ?? '');
	const r = undoable(u.id, `Copy "${src.title}"`, [], () => {
		const row = items.duplicateTo(u.id, src.id, date);
		return { result: row, created: [{ t: 'items', id: row.id }] };
	});
	return json({ item: items.withCounts([r.result])[0], undo: r.undo }, { status: 201 });
});
