// in-app channel: reminders sent since I last looked (each shown once)
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { inbox } from '$lib/server/reminders';

export const GET = api((e) => json({ reminders: inbox(me(e).id) }));
