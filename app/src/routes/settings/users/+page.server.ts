// Admin: who has an account, storage each uses (files vs UPLOAD_QUOTA_BYTES), sign-up mode (open | invite-only), invite codes for invite-only mode, disable a member.
import { fail } from '@sveltejs/kit';
import { admin } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';
import * as usersRepo from '$lib/server/repo/users';
import * as sessionsRepo from '$lib/server/repo/sessions';
import { createInvite, listInvites, revokeInvite, setSignupOpen, signupOpen } from '$lib/server/invites';
import { usageByOwner } from '$lib/server/attachments';
import { env } from '$lib/server/env';

export const load: PageServerLoad = ({ locals }) => {
	admin(locals);
	const now = new Date().toISOString();
	return {
		users: usersRepo.list(),
		disabled: usersRepo.disabledIds(),
		storage: usageByOwner(),
		quota: env().UPLOAD_QUOTA_BYTES,
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
		const r = createInvite(me.id);
		return { code: r.code };
	},
	disable: async ({ locals, request }) => {
		const me = admin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const u = usersRepo.byId(id);
		if (!u) return fail(404, { message: 'User not found.' });
		if (u.id === me.id || u.role === 'admin') return fail(400, { message: "Admins can't be disabled here." });
		usersRepo.disable(u.id);
		sessionsRepo.removeAllFor(u.id); // signed out everywhere at once
		return { disabledName: u.displayName };
	},
	revoke: async ({ locals, request }) => {
		admin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		if (!revokeInvite(id)) return fail(404, { message: 'Invite not found.' });
		return { revoked: true };
	},
};
