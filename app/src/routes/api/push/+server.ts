// Web Push (D-23): GET state · POST subscribe this device · DELETE {endpoint} turn it off (row deleted at once, ADR-006)
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import { env } from '$lib/server/env';
import {
	MAX_DEVICES,
	pushEnabled,
	pushHostOk,
	subscribe,
	subscriptionCount,
	unsubscribe,
} from '$lib/server/jobs';

export const GET = api((e) =>
	json({
		available: pushEnabled(),
		publicKey: env().VAPID_PUBLIC_KEY ?? null,
		devices: subscriptionCount(me(e).id),
	}),
);
const sub = z
	.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }).strict() })
	.strict(); // prettier-ignore
export const POST = api(async (e) => {
	const u = me(e);
	const s = await body(e, sub);
	if (!pushHostOk(s.endpoint)) return json({ error: { code: 'bad_endpoint', message: 'Push from this browser is not supported.' } }, { status: 400 }); // prettier-ignore
	const r = subscribe(u.id, s, e.request.headers.get('user-agent'));
	if (r === 'full') return json({ error: { code: 'too_many_devices', message: `Push is on for ${MAX_DEVICES} devices already. Turn one off first.` } }, { status: 400 }); // prettier-ignore
	if (r === 'taken') return json({ error: { code: 'endpoint_taken', message: 'This device is set up for another account.' } }, { status: 409 }); // prettier-ignore
	return json({ ok: true }, { status: 201 });
});
export const DELETE = api(async (e) => {
	const u = me(e);
	const { endpoint } = await body(e, z.object({ endpoint: z.string().max(1000) }).strict());
	return json({ removed: unsubscribe(u.id, endpoint) });
});
