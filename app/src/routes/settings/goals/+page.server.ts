import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as goals from '$lib/server/repo/goals';
import { ApiFail } from '$lib/server/http';
import { quarterKey, todayLocal } from '$lib/time';

const guard = (fn: () => void) => {
	try {
		fn();
		return { ok: true };
	} catch (e) {
		if (e instanceof ApiFail) return fail(400, { message: e.message });
		throw e;
	}
};

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const cur = quarterKey(todayLocal(me.timezone));
	const q = url.searchParams.get('q');
	const period = q && goals.zPeriod.safeParse(q).success ? q : cur;
	return { period, current: cur, goals: goals.forPeriod(me.id, period) };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const f = await request.formData();
		const p = goals.goalCreateSchema.safeParse({ period: f.get('period'), text: f.get('text') });
		if (!p.success) return fail(400, { message: p.error.issues[0]?.message });
		return guard(() => goals.create((locals.user as App.SafeUser).id, p.data));
	},
	save: async ({ request, locals }) => {
		const f = await request.formData();
		const p = goals.goalPatchSchema.safeParse({ text: f.get('text'), done: f.get('done') === 'on' });
		if (!p.success) return fail(400, { message: p.error.issues[0]?.message });
		return guard(() => goals.update((locals.user as App.SafeUser).id, String(f.get('id')), p.data));
	},
	remove: async ({ request, locals }) => {
		const f = await request.formData();
		return guard(() => goals.remove((locals.user as App.SafeUser).id, String(f.get('id'))));
	},
	move: async ({ request, locals }) => {
		const me = locals.user as App.SafeUser;
		const f = await request.formData();
		const list = goals.forPeriod(me.id, String(f.get('period'))).map((g) => g.id);
		const i = list.indexOf(String(f.get('id')));
		const j = i + (f.get('dir') === 'up' ? -1 : 1);
		if (i < 0 || j < 0 || j >= list.length) return { ok: true };
		[list[i], list[j]] = [list[j] as string, list[i] as string];
		return guard(() => goals.reorder(me.id, list));
	},
};
