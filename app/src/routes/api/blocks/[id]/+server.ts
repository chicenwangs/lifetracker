import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';
import { undoable } from '$lib/server/undo';
import { recalcOwner } from '$lib/server/reminders';

export const PATCH = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const p = await body(e, blocks.blockPatchSchema);
	const cur = blocks.mustOwn(u.id, id);
	const verb = p.startAt || p.endAt ? 'Move' : p.label ? 'Rename' : 'Edit';
	const r = undoable(u.id, `${verb} "${cur.label}"`, [{ t: 'blocks', id }], () => ({ result: blocks.patch(u.id, id, p) }));
	recalcOwner(u.id);
	return json({ block: blocks.toDTO(r.result, blocks.itemTypeOf(r.result)), undo: r.undo });
}); // prettier-ignore

export const DELETE = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const cur = blocks.mustOwn(u.id, id);
	const r = undoable(u.id, `Delete "${cur.label}"`, [{ t: 'blocks', id }], () => ({ result: blocks.softDelete(u.id, id) }));
	recalcOwner(u.id);
	return json({ ok: true, ...r.result, undo: r.undo });
}); // prettier-ignore
