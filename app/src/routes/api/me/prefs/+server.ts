import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, bad, body, me } from '$lib/server/http';
import * as users from '$lib/server/repo/users';
import { USER_COLORS } from '$lib/colors';
import { parseHours } from '$lib/hours';
import { MAX_TYPES } from '$lib/itemtypes';
import { zTime } from '$lib/server/validate';

const isZone = (tz: string) => {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

const schema = z
	.object({
		overlapOn: z.boolean(),
		displayName: z.string().trim().min(1).max(60),
		color: z.enum(USER_COLORS),
		/** v1 header button: a fixed choice */
		theme: z.enum(['dark', 'light']),
		themeMode: z.enum(['dark', 'light', 'auto']),
		themeLightStart: zTime,
		themeDarkStart: zTime,
		planMode: z.enum(['night', 'morning', 'off']).nullable(),
		tourState: z.enum(['new', 'skipped', 'done']),
		timezone: z.string().max(64).refine(isZone, 'unknown timezone'),
		region: z.enum(['my', 'us']),
		qaTarget: z.enum(['timeline', 'calendar']),
		blockMin: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
		visibleHours: z.string().regex(/^\d{1,2}-\d{1,2}$/),
		hiddenTypes: z.array(z.string().max(40)).max(MAX_TYPES + 1),
	})
	.partial()
	.strict();

export const PATCH = api(async (e) => {
	const u = me(e);
	const p: users.Prefs = await body(e, schema);
	// fixed header choice also moves the mode (leaves Auto)
	if (p.theme && !p.themeMode) p.themeMode = p.theme;
	if (p.themeMode && p.themeMode !== 'auto') p.theme = p.themeMode;
	const light = p.themeLightStart ?? u.themeLightStart;
	const dark = p.themeDarkStart ?? u.themeDarkStart;
	if (light === dark) bad('Light and dark need different start times.', 'same_start'); // D-08
	if (p.visibleHours) {
		const r = parseHours(p.visibleHours);
		p.visibleHours = `${r.start}-${r.end}`;
	}
	if (Object.keys(p).length) users.setPrefs(u.id, p);
	const row = users.byId(u.id);
	return json({ user: row ? users.safe(row) : null });
});
