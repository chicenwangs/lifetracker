import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { signup } from '$lib/server/invites';
import { createSession } from '$lib/server/auth';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
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
