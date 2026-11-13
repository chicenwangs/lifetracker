import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';
import { undoable } from '$lib/server/undo';

export const POST = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const cur = blocks.mustOwn(u.id, id);
	const r = undoable(u.id, `Status "${cur.label}"`, [{ t: 'blocks', id }], () => ({
		result: blocks.cycle(u.id, id),
	}));
	return json({ block: blocks.toDTO(r.result, blocks.itemTypeOf(r.result)), undo: r.undo });
});
