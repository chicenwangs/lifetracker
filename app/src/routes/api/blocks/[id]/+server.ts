import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';

export const PATCH = api(async (e) => {
	const u = me(e);
	const b = blocks.patch(u.id, e.params.id ?? '', await body(e, blocks.blockPatchSchema));
	return json({ block: blocks.toDTO(b, blocks.itemTypeOf(b)) });
});

export const DELETE = api((e) => {
	blocks.softDelete(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
