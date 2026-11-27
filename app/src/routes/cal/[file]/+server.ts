// GET /cal/<token>.ics — the read-only calendar feed (card 07, O-1 item 4, D-V4-08, D-V4-25).
// Public and unauthenticated. Every failure returns the same bare 404 from here: no throw ever reaches
// handleError, which logs the path — and the path holds the token.
import type { RequestHandler } from './$types';
import * as usersRepo from '$lib/server/repo/users';
import * as itemsRepo from '$lib/server/repo/items';
import * as blocksRepo from '$lib/server/repo/blocks';
import { agenda } from '$lib/server/agenda';
import { buildIcs } from '$lib/server/ics';
import { sha256hex } from '$lib/server/crypto';
import * as rl from '$lib/server/ratelimit';
import { addDays, durationMin, todayLocal } from '$lib/time';

const MAX_REQ = 120; // per 15-minute window, per client IP (D-V4-08)

const bare = (status: number) =>
	new Response('{}', {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
	});

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	try {
		if (rl.fail(`cal:${rl.ipKey(getClientAddress())}`, 0).count > MAX_REQ) return bare(429);
		const file = params.file ?? '';
		if (!file.endsWith('.ics')) return bare(404);
		const row = usersRepo.byIcsTokenHash(sha256hex(file.slice(0, -4)));
		if (!row) return bare(404);
		const me = usersRepo.safe(row);
		const today = todayLocal(me.timezone);
		// [from, to): today-30 .. today+365 (card 05's maxDays default stays 62)
		const items = agenda(me, addDays(today, -30), addDays(today, 366), { maxDays: 400 }).items;
		const series = [...new Set(items.map((i) => i.seriesId ?? i.id))];
		const body = buildIcs({
			timezone: me.timezone,
			rows: items,
			notes: itemsRepo.notesFor(series), // one query for every series (D-V4-37)
			blockMin: (id) => {
				const b = blocksRepo.forItem(me.id, id)[0]; // ordered by start: the earliest linked block
				return b ? durationMin(b.startAt, b.endAt) : undefined;
			},
		});
		return new Response(body, {
			status: 200,
			headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' },
		});
	} catch {
		return bare(404);
	}
};
