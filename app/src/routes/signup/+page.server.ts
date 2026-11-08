import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { signup, signupOpen } from '$lib/server/invites';
import { createSession } from '$lib/server/auth';
import { isSetupDone } from '$lib/server/setup';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	if (!isSetupDone()) redirect(303, '/login'); // -> /setup while first run is open
	return { open: signupOpen() };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, locals }) => {
		if (locals.user) redirect(303, '/'); // already signed in: no second account from this session
		const f = await request.formData();
		const input = {
			code: String(f.get('code') ?? ''),
			username: String(f.get('username') ?? ''),
			displayName: String(f.get('displayName') ?? ''),
			password: String(f.get('password') ?? ''),
		};
		if (input.password !== String(f.get('confirm') ?? ''))
			return fail(400, { message: 'Passwords do not match.', ...input, password: '' });
		const ip = getClientAddress();
		const r = await signup(input, ip);
		if (!r.ok) return fail(r.status, { message: r.message, ...input, password: '' });
		createSession(r.userId, true, { ip, userAgent: request.headers.get('user-agent') }, cookies);
		redirect(303, '/');
	},
};
