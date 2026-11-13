// Settings › Notifications "Send a test". Says "sent" only when a push service accepted it (never "delivered").
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { pushTo } from '$lib/server/jobs';

export const POST = api(async (e) => json(await pushTo(me(e).id, { title: 'Test from Life Tracker', body: 'Push works on this device.', route: '/settings/notifications' }))); // prettier-ignore
