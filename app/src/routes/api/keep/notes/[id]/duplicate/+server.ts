import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const POST = api((e) => json({ note: keep.duplicate(me(e).id, e.params.id ?? '') }, { status: 201 }));
