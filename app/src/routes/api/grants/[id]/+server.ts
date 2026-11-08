// PATCH {inOverlap} (grantee) · DELETE = owner removes or grantee leaves
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me, notFound } from '$lib/server/http';
import * as grants from '$lib/server/repo/grants';

export const PATCH = api(async (e) => {
	const u = me(e);
	const { inOverlap } = await body(e, z.object({ inOverlap: z.boolean() }).strict());
	if (!grants.setInOverlap(u.id, e.params.id ?? '', inOverlap)) notFound();
	return json({ ok: true });
});
export const DELETE = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	if (!grants.removeGiven(u.id, id) && !grants.leave(u.id, id)) notFound();
	return json({ ok: true });
});
