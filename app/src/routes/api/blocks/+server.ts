import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';
import { undoable } from '$lib/server/undo';

export const POST = api(async (e) => {
	const u = me(e);
	const input = await body(e, blocks.blockCreateSchema);
	const r = undoable(u.id, 'Add block', [], () => {
		const b = blocks.create(u.id, input);
		return { result: b, created: [{ t: 'blocks', id: b.id }] };
	});
	return json({ block: blocks.toDTO(r.result, blocks.itemTypeOf(r.result)), undo: r.undo }, { status: 201 });
});
