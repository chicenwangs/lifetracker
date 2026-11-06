import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { logout } from '$lib/server/auth';

// GET never logs out (FR-A4: POST only).
export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: ({ cookies }) => {
		logout(cookies);
		redirect(303, '/login');
	},
};
