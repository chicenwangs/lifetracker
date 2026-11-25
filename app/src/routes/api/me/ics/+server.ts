// Settings › Calendar feed. POST = create or rotate (old link dies), DELETE = turn off. The URL is shown once.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { env } from '$lib/server/env';
import * as users from '$lib/server/repo/users';

export const POST = api((e) => {
	const token = users.newIcsToken(me(e).id);
	return json({ url: `${env().ORIGIN}/cal/${token}.ics` });
});
export const DELETE = api((e) => {
	users.clearIcsToken(me(e).id);
	return json({ ok: true });
});
