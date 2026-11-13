import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { ApiFail } from '$lib/server/http';
import { importDormant, pending } from '$lib/server/dormant';
import { changePassword } from '$lib/server/auth';
import * as users from '$lib/server/repo/users';
import { USER_COLORS } from '$lib/colors';

const profile = z
	.object({
		displayName: z.string().trim().min(1, 'Display name needed').max(60),
		color: z.enum(USER_COLORS),
	})
	.strict();

/** D-22: old v1 lists, people, ideas, places, goals, workouts waiting to become Keep notes (null = done) */
export const load: PageServerLoad = ({ locals }) => {
	const p = pending((locals.user as App.SafeUser).id);
	return { v1: p && Object.values(p).some((n) => n > 0) ? p : null };
};

export const actions: Actions = {
	importV1: ({ locals }) => {
		try {
			return { v1Ok: importDormant((locals.user as App.SafeUser).id).notes };
		} catch (e) {
			if (e instanceof ApiFail) return fail(e.status, { v1Msg: e.message });
			throw e;
		}
	},
	profile: async ({ request, locals }) => {
		const me = locals.user as App.SafeUser;
		const f = await request.formData();
		const p = profile.safeParse({ displayName: f.get('displayName'), color: f.get('color') });
		if (!p.success) return fail(400, { profileMsg: p.error.issues[0]?.message });
		users.setPrefs(me.id, p.data);
		return { profileOk: true };
	},
	password: async ({ request, locals, cookies, getClientAddress }) => {
		const me = locals.user as App.SafeUser;
		const f = await request.formData();
		const next = String(f.get('next') ?? '');
		if (next !== String(f.get('confirm') ?? '')) return fail(400, { pwMsg: 'New passwords do not match.' });
		const r = await changePassword(me, String(f.get('current') ?? ''), next, cookies, {
			ip: getClientAddress(),
			userAgent: request.headers.get('user-agent'),
		});
		if (!r.ok) return fail(400, { pwMsg: r.message });
		return { pwOk: true };
	},
};
