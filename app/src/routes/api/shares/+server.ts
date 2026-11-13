// GET: pages + notes other people shared with me
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { sharedWithMe } from '$lib/server/repo/shares';

export const GET = api((e) => json(sharedWithMe(me(e).id)));
