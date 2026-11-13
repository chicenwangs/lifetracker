// Ctrl+K / module search (FEATURES §12): pages + notes from the FTS index, planner items by title. Mine only.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { search } from '$lib/server/search';
import { handle } from '$lib/server/db';

export const GET = api((e) => {
	const u = me(e);
	const q = (e.url.searchParams.get('q') ?? '').slice(0, 200);
	const kind = e.url.searchParams.get('kind');
	const includeArchived = e.url.searchParams.get('archived') === '1';
	const hits = search(u.id, q, { kinds: kind === 'page' || kind === 'note' ? [kind] : undefined, includeArchived, limit: 12 }); // prettier-ignore
	// planner: plain title match (shortcut: LIKE over my items; move to the FTS index if it gets slow)
	const like = `%${q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	const items =
		!q.trim() || kind
			? []
			: (handle()
					.sqlite.prepare(
						`SELECT i.id, i.title, i.date FROM items i JOIN calendars c ON c.id = i.calendar_id
						 WHERE c.owner_id = ? AND i.deleted_at IS NULL AND i.title LIKE ? ESCAPE '\\' ORDER BY i.date DESC LIMIT 8`,
					)
					.all(u.id, like) as { id: string; title: string; date: string | null }[]);
	return json({ hits, items });
});
