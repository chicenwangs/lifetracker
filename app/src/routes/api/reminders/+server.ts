// GET ?source=&id= reminders on one thing · POST {source, sourceId, offset | at}
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, bad, body, me } from '$lib/server/http';
import * as rem from '$lib/server/reminders';

const SOURCES = ['planner_item', 'planner_block', 'keep_note', 'database_record'] as const;
export const GET = api((e) => {
	const s = e.url.searchParams.get('source');
	if (!SOURCES.includes(s as never)) bad('unknown source');
	return json({ reminders: rem.list(me(e).id, s as rem.Source, e.url.searchParams.get('id') ?? '') });
});
const schema = z
	.object({ source: z.enum(SOURCES), sourceId: z.string().max(40), offset: z.string().max(10).optional(), at: z.string().max(25).optional() })
	.strict(); // prettier-ignore
export const POST = api(async (e) => {
	const u = me(e);
	const p = await body(e, schema);
	const rule = rem.addSchema.safeParse({ offset: p.offset, at: p.at });
	if (!rule.success) bad(rule.error.issues[0]?.message ?? 'bad reminder');
	return json(
		{ reminder: rem.add(u.id, p.source, p.sourceId, rule.data as z.infer<typeof rem.addSchema>) },
		{ status: 201 },
	);
});
