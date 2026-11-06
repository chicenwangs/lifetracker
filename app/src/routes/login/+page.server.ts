import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { login, safeNext } from '$lib/server/auth';
import { setupOpen } from '$lib/server/setup';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	if (setupOpen()) redirect(303, '/setup');
	return { next: url.searchParams.get('next') ?? '' };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const f = await request.formData();
		const username = String(f.get('username') ?? '');
		const password = String(f.get('password') ?? '');
		const remember = f.get('remember') === 'on';
		const r = await login(
			{ username, password, remember },
			{ ip: getClientAddress(), userAgent: request.headers.get('user-agent') },
			cookies,
		);
		if (!r.ok) return fail(r.status, { message: r.message, username, remember });
		redirect(303, safeNext(String(f.get('next') ?? url.searchParams.get('next') ?? '')));
	},
};
