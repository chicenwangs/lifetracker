// Admin: who has an account, sign-up mode (open | invite-only), invite codes for invite-only mode.
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as usersRepo from '$lib/server/repo/users';
import { createInvite, listInvites, revokeInvite, setSignupOpen, signupOpen } from '$lib/server/invites';

function admin(locals: App.Locals): App.SafeUser {
	const u = locals.user;
	if (!u || u.role !== 'admin') error(404, { code: 'not_found', message: 'Not found' });
	return u;
}

export const load: PageServerLoad = ({ locals }) => {
	admin(locals);
	const now = new Date().toISOString();
	return {
		users: usersRepo.list(),
		open: signupOpen(),
		invites: listInvites().filter((i) => !i.usedAt && !i.revokedAt && i.expiresAt > now),
	};
};

export const actions: Actions = {
	mode: async ({ locals, request }) => {
		admin(locals);
		const f = await request.formData();
		setSignupOpen(f.get('open') === '1');
		return { saved: true };
	},
	invite: async ({ locals }) => {
		const me = admin(locals);
		const r = createInvite(me.id, { expiry: '7d' });
		return { code: r.code };
	},
	revoke: async ({ locals, request }) => {
		admin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		if (!revokeInvite(id)) return fail(404, { message: 'Invite not found.' });
		return { revoked: true };
	},
};
