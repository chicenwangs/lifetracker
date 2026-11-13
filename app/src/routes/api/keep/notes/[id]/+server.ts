// GET · PATCH (any fields, whole lists for items/labels/binders/images, optional revision) · DELETE = forever (Trash only)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';
import { recalcOwner } from '$lib/server/reminders';

export const GET = api((e) => json({ note: keep.get(me(e).id, e.params.id ?? '') }));
export const PATCH = api(async (e) => {
	const u = me(e);
	const note = keep.update(u.id, e.params.id ?? '', await body(e, keep.noteSchema));
	recalcOwner(u.id);
	return json({ note });
});
export const DELETE = api((e) => {
	keep.destroy(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
