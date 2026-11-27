// Settings › Calendar feed (card 07, O-1 item 4, D-V4-25). One read-only ICS URL per user; the full URL is
// returned once by the action (`form.url`) and never stored — only the token's SHA-256 is.
import type { Actions, PageServerLoad } from './$types';
import * as usersRepo from '$lib/server/repo/users';
import { icsToken, sha256hex } from '$lib/server/crypto';
import { env } from '$lib/server/env';

const me = (l: App.Locals) => l.user as App.SafeUser;

type Done = { url?: string; ok?: string; msg?: string };

export const load: PageServerLoad = ({ locals }) => ({ exists: !!usersRepo.icsTokenHash(me(locals).id) });

function mint(id: string): Done {
	const token = icsToken();
	usersRepo.setIcsTokenHash(id, sha256hex(token));
	return { url: `${env().ORIGIN}/cal/${token}.ics` };
}

export const actions: Actions = {
	create: ({ locals }): Done => mint(me(locals).id),
	rotate: ({ locals }): Done => mint(me(locals).id),
	off: ({ locals }): Done => {
		usersRepo.setIcsTokenHash(me(locals).id, null);
		return { ok: 'Feed is off.' };
	},
};
