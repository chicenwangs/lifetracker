// Alt-drag copy (D-09): new block at startAt, one undo entry.
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';
import { zIsoZ } from '$lib/server/validate';
import { undoable } from '$lib/server/undo';

export const POST = api(async (e) => {
	const u = me(e);
	const { startAt } = await body(e, z.object({ startAt: zIsoZ }).strict());
	const src = blocks.mustOwn(u.id, e.params.id ?? '');
	const r = undoable(u.id, `Copy "${src.label}"`, [], () => {
		const b = blocks.duplicateTo(u.id, src.id, startAt);
		return { result: b, created: [{ t: 'blocks', id: b.id }] };
	});
	return json({ block: blocks.toDTO(r.result, blocks.itemTypeOf(r.result)), undo: r.undo }, { status: 201 });
});
