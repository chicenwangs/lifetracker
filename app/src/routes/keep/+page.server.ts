// Keep list: ?scope=archive|trash · ?q= · ?label=<id> (repeat = all of them) · ?binder=<id> · ?note=<id> opens it
import type { PageServerLoad } from './$types';
import * as keep from '$lib/server/repo/keep';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = (locals.user as App.SafeUser).id;
	const s = url.searchParams.get('scope');
	const scope = s === 'archive' || s === 'trash' ? s : 'active';
	const q = url.searchParams.get('q')?.slice(0, 200) ?? '';
	const labels = url.searchParams.getAll('label').slice(0, 10);
	const binder = url.searchParams.get('binder') ?? '';
	return {
		scope,
		q,
		labelFilter: labels,
		binder,
		notes: keep.list(me, { scope, q, labels, binder: binder || undefined }),
		labels: keep.labels(me),
		binders: keep.binders(me),
		colors: keep.NOTE_COLORS,
	};
};
