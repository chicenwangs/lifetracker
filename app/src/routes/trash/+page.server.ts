import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as items from '$lib/server/repo/items';

export const load: PageServerLoad = ({ locals }) => {
	const rows = items.trash((locals.user as App.SafeUser).id);
	// group by batch; show the top-level (or first) row per batch
	const batches = new Map<
		string,
		{
			batch: string;
			title: string;
			type: string | null;
			date: string | null;
			deletedAt: string | null;
			count: number;
		}
	>();
	for (const r of rows) {
		if (!r.batch) continue;
		const b = batches.get(r.batch);
		if (!b)
			batches.set(r.batch, {
				batch: r.batch,
				title: r.title,
				type: r.type,
				date: r.date,
				deletedAt: r.deletedAt,
				count: 1,
			});
		else {
			b.count++;
			if (!r.parentId) b.title = r.title;
		}
	}
	return { batches: [...batches.values()] };
};

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		const batch = String((await request.formData()).get('batch') ?? '');
		const n = items.restore((locals.user as App.SafeUser).id, batch);
		if (!n) return fail(404, { message: 'Not found' });
		return { restored: n };
	},
};
