import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as blocks from '$lib/server/repo/blocks';

export const POST = api((e) => {
	const b = blocks.cycle(me(e).id, e.params.id ?? '');
	return json({ block: blocks.toDTO(b, blocks.itemTypeOf(b)) });
});
