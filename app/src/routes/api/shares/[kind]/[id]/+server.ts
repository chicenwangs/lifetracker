// Owner only. kind = page | note. GET who has it · POST {username, permission} add or change · DELETE {shareId} revoke
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me, notFound } from '$lib/server/http';
import * as shares from '$lib/server/repo/shares';

const kindOf = (k: string | undefined): shares.Kind => (k === 'page' || k === 'note' ? k : notFound());

export const GET = api((e) =>
	json({ shares: shares.list(kindOf(e.params.kind), me(e).id, e.params.id ?? '') }),
);
export const POST = api(async (e) => {
	const u = me(e);
	const k = kindOf(e.params.kind);
	return json({ shares: shares.put(k, u.id, e.params.id ?? '', await body(e, shares.shareSchema)) });
});
export const DELETE = api(async (e) => {
	const u = me(e);
	const k = kindOf(e.params.kind);
	const p = await body(e, z.object({ shareId: z.string().max(40) }).strict());
	return json({ shares: shares.revoke(k, u.id, e.params.id ?? '', p.shareId) });
});
