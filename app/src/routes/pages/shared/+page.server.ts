// Pages › Shared with me (FEATURES §8): pages other people shared with me. Lives in the Pages layout (tree left).
import type { PageServerLoad } from './$types';
import { sharedWithMe } from '$lib/server/repo/shares';

export const load: PageServerLoad = ({ locals }) => {
	const s = sharedWithMe((locals.user as App.SafeUser).id);
	return { shared: s.pages, notes: s.notes.length };
};
