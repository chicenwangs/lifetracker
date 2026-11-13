// GET ?scope=active|archive|trash&q=&label=<id>(repeat)&binder=<id> · POST new note (empty = 400)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const GET = api((e) => {
	const q = e.url.searchParams;
	const scope = q.get('scope');
	return json({
		notes: keep.list(me(e).id, {
			scope: scope === 'archive' || scope === 'trash' ? scope : 'active',
			q: q.get('q')?.slice(0, 200) ?? undefined,
			labels: q.getAll('label').slice(0, 10),
			binder: q.get('binder') ?? undefined,
		}),
	});
});
export const POST = api(async (e) => {
	const u = me(e);
	return json({ note: keep.create(u.id, await body(e, keep.noteSchema)) }, { status: 201 });
});
