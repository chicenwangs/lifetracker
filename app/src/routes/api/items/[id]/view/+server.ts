import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { itemView } from '$lib/server/itemview';

export const GET = api((e) => json(itemView(me(e), e.params.id ?? '')));
