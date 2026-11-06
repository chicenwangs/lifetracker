import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, bad, body, me } from '$lib/server/http';
import * as goals from '$lib/server/repo/goals';

export const GET = api((e) => {
	const p = goals.zPeriod.safeParse(e.url.searchParams.get('period'));
	if (!p.success) bad('period like 2026-Q4');
	return json({ goals: goals.forPeriod(me(e).id, p.data as string) });
});
export const POST = api(async (e) => {
	const u = me(e);
	return json({ goal: goals.create(u.id, await body(e, goals.goalCreateSchema)) }, { status: 201 });
});
export const PATCH = api(async (e) => {
	const u = me(e);
	const { ids } = await body(e, z.object({ ids: z.array(z.string()).max(200) }).strict());
	goals.reorder(u.id, ids);
	return json({ ok: true });
});
