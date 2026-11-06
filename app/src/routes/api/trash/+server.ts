import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';

export const GET = api((e) => json({ items: items.trash(me(e).id) }));
