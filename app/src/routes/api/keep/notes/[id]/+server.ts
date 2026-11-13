// GET · PATCH (any fields, whole lists for items/labels/binders/images, optional revision) · DELETE = forever (Trash only)
// Shared notes (P7): view = GET only; edit = title, body, type, checklist. Labels, binders, colour, pin, files, archive
// and trash stay the owner's (their labels mean nothing to someone else).
import { json } from '@sveltejs/kit';
import { api, body, me, notFound } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';
import { level, need } from '$lib/server/repo/shares';
import { recalcOwner } from '$lib/server/reminders';

export const GET = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const a = level('note', u.id, id);
	if (!a) return notFound();
	const note = keep.get(a.ownerId, id);
	return json({ note: a.access === 'owner' ? note : { ...note, labels: [], binders: [] }, access: a.access });
});
export const PATCH = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const owner = need('note', u.id, id, 'edit');
	const p = await body(e, keep.noteSchema);
	const note = keep.update(owner, id, owner === u.id ? p : { title: p.title, body: p.body, type: p.type, items: p.items, revision: p.revision }); // prettier-ignore
	recalcOwner(owner);
	return json({ note: owner === u.id ? note : { ...note, labels: [], binders: [] } });
});
export const DELETE = api((e) => {
	keep.destroy(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
