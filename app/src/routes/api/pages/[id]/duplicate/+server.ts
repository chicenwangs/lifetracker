// Page ⋯ Duplicate (card 17, O-3, D-V4-23): a new page for the viewer, one transaction. No journal row:
// the toast Undo trashes the copy through DELETE /api/pages/:id.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { duplicate } from '$lib/server/repo/duplicate';

export const POST = api((e) => json({ page: duplicate(me(e).id, e.params.id ?? '') }, { status: 201 }));
