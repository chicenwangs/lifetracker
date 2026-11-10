import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as users from '$lib/server/repo/users';
import { USER_COLORS } from '$lib/colors';

const schema = z
	.object({
		overlapOn: z.boolean(),
		displayName: z.string().trim().min(1).max(60),
		color: z.enum(USER_COLORS),
		theme: z.enum(['dark', 'light']),
		planMode: z.enum(['night', 'morning', 'off']).nullable(),
	})
	.partial()
	.strict();

export const PATCH = api(async (e) => {
	const u = me(e);
	const patch = await body(e, schema);
	if (Object.keys(patch).length) users.setPrefs(u.id, patch);
	const row = users.byId(u.id);
	return json({ user: row ? users.safe(row) : null });
});
