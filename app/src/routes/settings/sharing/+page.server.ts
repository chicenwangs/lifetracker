// Settings > Sharing (FR-S1..S9, rev 2026-11-08 view-only). Swap codes: each person makes one, the other enters it.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as keys from '$lib/server/repo/sharekeys';
import * as grants from '$lib/server/repo/grants';
import { SHARE_KINDS } from '$lib/types';

const me = (l: App.Locals) => l.user as App.SafeUser;

export const load: PageServerLoad = ({ locals }) => {
	const u = me(locals);
	return { unused: keys.listUnused(u.id), given: grants.given(u.id), received: grants.received(u.id) };
};

export const actions: Actions = {
	make: async ({ locals, request }) => {
		const f = await request.formData();
		const types = f.getAll('types').map(String);
		const p = keys.shareKeyCreateSchema.safeParse({
			types: types.filter((t) => (SHARE_KINDS as readonly string[]).includes(t)),
			hiddenAs: f.get('hiddenAs') === 'none' ? 'none' : 'busy',
			expiry: f.get('expiry') === '24h' ? '24h' : '7d',
		});
		if (!p.success) return fail(400, { makeMsg: 'Pick what they can see.' });
		const r = keys.create(me(locals).id, p.data);
		return { code: r.code, expiresAt: r.expiresAt };
	},
	cancel: async ({ locals, request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!keys.revoke(me(locals).id, id)) return fail(404, { msg: 'Code not found.' });
		return { ok: 'Code cancelled.' };
	},
	redeem: async ({ locals, request }) => {
		const code = String((await request.formData()).get('code') ?? '');
		const r = keys.redeem(me(locals).id, code);
		if (!r.ok) return fail(r.status, { redeemMsg: r.message, typed: code });
		const g = grants.received(me(locals).id).find((x) => x.id === r.grantId);
		return { redeemed: g?.name ?? 'them' };
	},
	remove: async ({ locals, request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!grants.removeGiven(me(locals).id, id)) return fail(404, { msg: 'Not found.' });
		return { ok: 'Removed. They can no longer see your calendar.' };
	},
	leave: async ({ locals, request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!grants.leave(me(locals).id, id)) return fail(404, { msg: 'Not found.' });
		return { ok: 'Left. Their calendar is no longer shown.' };
	},
	overlap: async ({ locals, request }) => {
		const f = await request.formData();
		const on = f.get('on') === '1';
		if (!grants.setInOverlap(me(locals).id, String(f.get('id') ?? ''), on))
			return fail(404, { msg: 'Not found.' });
		return {};
	},
};
