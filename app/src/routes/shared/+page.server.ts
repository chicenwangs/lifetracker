// "Shared with me" (FEATURES §8): pages + Keep notes other people shared with me. Nothing of theirs beyond these.
import type { PageServerLoad } from './$types';
import * as keep from '$lib/server/repo/keep';
import { level, sharedWithMe } from '$lib/server/repo/shares';

export const load: PageServerLoad = ({ locals }) => {
	const uid = (locals.user as App.SafeUser).id;
	const s = sharedWithMe(uid);
	const notes = s.notes.flatMap((n) => {
		const a = level('note', uid, n.id);
		return a ? [{ ...n, note: { ...keep.get(a.ownerId, n.id), labels: [], binders: [] } }] : [];
	});
	return { pages: s.pages, notes };
};
