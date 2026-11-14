// Keep list: ?scope=archive|trash|shared · ?q= · ?label=<id> (repeat = all of them) · ?binder=<id> · ?note=<id> opens it
import type { PageServerLoad } from './$types';
import * as keep from '$lib/server/repo/keep';
import { level, sharedWithMe } from '$lib/server/repo/shares';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = (locals.user as App.SafeUser).id;
	const s = url.searchParams.get('scope');
	const scope = s === 'archive' || s === 'trash' || s === 'shared' ? s : 'active';
	const q = url.searchParams.get('q')?.slice(0, 200) ?? '';
	const labels = url.searchParams.getAll('label').slice(0, 10);
	const binder = url.searchParams.get('binder') ?? '';
	// shared with me (FEATURES §8): other people's notes, each re-checked; nothing else of theirs
	const shared =
		scope === 'shared'
			? sharedWithMe(me).notes.flatMap((n) => {
					const a = level('note', me, n.id);
					return a ? [{ note: { ...keep.get(a.ownerId, n.id), labels: [], binders: [] }, permission: n.permission, owner: n.owner }] : []; // prettier-ignore
				})
			: [];
	return {
		scope,
		shared: Object.fromEntries(shared.map((x) => [x.note.id, { permission: x.permission, owner: x.owner }])),
		q,
		labelFilter: labels,
		binder,
		notes:
			scope === 'shared'
				? shared.map((x) => x.note)
				: keep.list(me, { scope, q, labels, binder: binder || undefined }),
		labels: keep.labels(me),
		binders: keep.binders(me),
		colors: keep.NOTE_COLORS,
	};
};
