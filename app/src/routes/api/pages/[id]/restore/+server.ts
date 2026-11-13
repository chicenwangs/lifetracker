// restore from Archive (with the subpages archived alongside)
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const POST = api((e) => json({ restored: pages.restoreArchived(me(e).id, e.params.id ?? '') }));
