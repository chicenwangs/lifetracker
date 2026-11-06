import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { runSetup, setupOpen } from '$lib/server/setup';
import { createSession } from '$lib/server/auth';

export const load: PageServerLoad = () => {
	if (!setupOpen()) error(404, { code: 'not_found', message: 'Not found' });
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		if (!setupOpen()) error(404, { code: 'not_found', message: 'Not found' });
		const f = await request.formData();
		const input = {
			token: String(f.get('token') ?? '').trim(),
			username: String(f.get('username') ?? ''),
			displayName: String(f.get('displayName') ?? ''),
			password: String(f.get('password') ?? ''),
		};
		if (input.password !== String(f.get('confirm') ?? ''))
			return fail(400, {
				message: 'Passwords do not match.',
				username: input.username,
				displayName: input.displayName,
			});
		const ip = getClientAddress();
		const r = await runSetup(input, ip);
		if (!r.ok) {
			if (r.status === 404) error(404, { code: 'not_found', message: 'Not found' });
			return fail(r.status, { message: r.message, username: input.username, displayName: input.displayName });
		}
		createSession(r.userId, true, { ip, userAgent: request.headers.get('user-agent') }, cookies);
		redirect(303, '/');
	},
};
