import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';

export const POST = api(async (e) => {
	const u = me(e);
	const b = blocks.create(u.id, await body(e, blocks.blockCreateSchema));
	return json({ block: blocks.toDTO(b, blocks.itemTypeOf(b)) }, { status: 201 });
});
