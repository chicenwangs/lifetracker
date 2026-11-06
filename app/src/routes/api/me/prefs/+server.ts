import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as users from '$lib/server/repo/users';

const USER_COLORS = ['#1C1917', '#0F766E', '#6D28D9', '#B45309'] as const;
const schema = z
	.object({
		overlapOn: z.boolean(),
		displayName: z.string().trim().min(1).max(60),
		color: z.enum(USER_COLORS),
	})
	.partial()
	.strict();

export const PATCH = api(async (e) => {
	const u = me(e);
	users.setPrefs(u.id, await body(e, schema));
	const row = users.byId(u.id);
	return json({ user: row ? users.safe(row) : null });
});
