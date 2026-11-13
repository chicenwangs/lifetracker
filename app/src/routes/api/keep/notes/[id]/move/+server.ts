// {before: noteId | null, binder?: binderId}: place just above `before` (null = bottom), in a binder if given
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const POST = api(async (e) => {
	const u = me(e);
	const p = await body(
		e,
		z.object({ before: z.string().max(40).nullable(), binder: z.string().max(40).optional() }).strict(),
	);
	keep.move(u.id, e.params.id ?? '', p.before, p.binder);
	return json({ ok: true });
});
