import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as courses from '$lib/server/repo/courses';
import { ApiFail } from '$lib/server/http';

const aliases = (s: string) => s.split(/[\s,]+/).filter(Boolean);
const guard = (fn: () => void) => {
	try {
		fn();
		return { ok: true };
	} catch (e) {
		if (e instanceof ApiFail) return fail(400, { message: e.message });
		throw e;
	}
};

export const load: PageServerLoad = ({ locals }) => ({
	courses: courses.list((locals.user as App.SafeUser).id),
});

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const f = await request.formData();
		const p = courses.courseSchema.safeParse({
			code: f.get('code'),
			name: f.get('name'),
			aliases: aliases(String(f.get('aliases') ?? '')),
		});
		if (!p.success) return fail(400, { message: p.error.issues[0]?.message });
		return guard(() => courses.create((locals.user as App.SafeUser).id, p.data));
	},
	save: async ({ request, locals }) => {
		const f = await request.formData();
		const p = courses.courseSchema.safeParse({
			code: f.get('code'),
			name: f.get('name'),
			aliases: aliases(String(f.get('aliases') ?? '')),
			active: f.get('active') === 'on',
		});
		if (!p.success) return fail(400, { message: p.error.issues[0]?.message });
		return guard(() => courses.update((locals.user as App.SafeUser).id, String(f.get('id')), p.data));
	},
	remove: async ({ request, locals }) => {
		const f = await request.formData();
		return guard(() => courses.remove((locals.user as App.SafeUser).id, String(f.get('id'))));
	},
};
