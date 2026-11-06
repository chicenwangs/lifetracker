import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as sessions from '$lib/server/repo/sessions';
import { currentSid } from '$lib/server/auth';

function shortUA(ua: string | null): string {
	if (!ua) return 'Unknown device';
	const b = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'Browser';
	const os = /Windows/.test(ua)
		? 'Windows'
		: /Android/.test(ua)
			? 'Android'
			: /iPhone|iPad/.test(ua)
				? 'iOS'
				: /Mac OS X/.test(ua)
					? 'macOS'
					: /Linux/.test(ua)
						? 'Linux'
						: '';
	return os ? `${b} on ${os}` : b;
}

export const load: PageServerLoad = ({ locals, cookies }) => {
	const me = locals.user as App.SafeUser;
	const cur = currentSid(cookies);
	return {
		sessions: sessions.listFor(me.id).map((s) => ({
			key: s.id.slice(0, 12),
			device: shortUA(s.userAgent),
			ip: s.ip,
			createdAt: s.createdAt,
			lastSeenAt: s.lastSeenAt,
			remember: s.remember,
			current: s.id === cur,
		})),
	};
};

export const actions: Actions = {
	revoke: async ({ request, locals, cookies }) => {
		const me = locals.user as App.SafeUser;
		const key = String((await request.formData()).get('key') ?? '');
		const cur = currentSid(cookies);
		const target = sessions.listFor(me.id).find((s) => s.id.slice(0, 12) === key);
		if (!target || target.id === cur) return fail(400, { message: 'Use Sign out for this device.' });
		sessions.removeOwn(me.id, target.id);
		return { ok: true };
	},
	others: ({ locals, cookies }) => {
		const me = locals.user as App.SafeUser;
		const cur = currentSid(cookies);
		if (!cur) return fail(400, { message: 'No session' });
		const n = sessions.removeAllExcept(me.id, cur);
		return { removed: n };
	},
};
