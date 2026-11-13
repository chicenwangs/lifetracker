// PATCH name/colour/slug/flags · DELETE {moveTo} = delete a custom type, its items + blocks move (one undo)
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as itemTypes from '$lib/server/repo/itemtypes';
import { handle } from '$lib/server/db';
import { undoable, type Target } from '$lib/server/undo';

export const PATCH = api(async (e) => {
	const u = me(e);
	return json({ type: itemTypes.patch(u.id, e.params.id ?? '', await body(e, itemTypes.patchSchema)) });
});

export const DELETE = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const { moveTo } = await body(e, z.object({ moveTo: z.string().max(40).nullable() }).strict());
	const t = itemTypes.list(u.id).find((x) => x.id === id);
	// rows the move touches, so one undo puts the type and every item/block back
	const using = t
		? (handle()
				.sqlite.prepare(
					`SELECT 'items' AS t, i.id FROM items i JOIN calendars c ON c.id = i.calendar_id WHERE c.owner_id = ? AND i.type = ?
					 UNION ALL SELECT 'blocks', b.id FROM blocks b JOIN calendars c ON c.id = b.calendar_id WHERE c.owner_id = ? AND b.type = ?`,
				)
				.all(u.id, t.key, u.id, t.key) as Target[])
		: [];
	const r = undoable(u.id, `Delete type "${t?.name ?? ''}"`, [{ t: 'item_types', id }, ...using], () => ({
		result: itemTypes.remove(u.id, id, moveTo),
	}));
	return json({ moved: r.result.moved, undo: r.undo });
});
