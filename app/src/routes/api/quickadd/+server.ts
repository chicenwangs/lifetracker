import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import { quickAdd } from '$lib/server/quickadd-server';
import { isDate } from '$lib/time';

// slot = range dragged on a timeline (planner / week), or a month day (`day`: no time, start/end ignored).
// Typed day/time in `text` still wins.
const slotSchema = z
	.object({
		date: z.string().refine(isDate, 'bad date'),
		start: z.number().int().min(0).max(1439),
		end: z.number().int().min(0).max(2880),
		day: z.literal(true).optional(),
	})
	.strict()
	.refine((s) => s.day || s.end > s.start, 'end must be after start')
	.refine((s) => s.end - s.start <= 1440, 'slot can be at most 24 h');

export const POST = api(async (e) => {
	const u = me(e);
	const { text, slot } = await body(
		e,
		z.object({ text: z.string().max(500), slot: slotSchema.optional() }).strict(),
	);
	return json(quickAdd(u, text, Date.now(), slot), { status: 201 });
});
