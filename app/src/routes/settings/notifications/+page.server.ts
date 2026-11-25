// v3.3 PR 12: today's digest preview for Settings › Notifications (live counts, no titles).
import type { PageServerLoad } from './$types';
import { digestText } from '$lib/server/digest';
import { todayLocal } from '$lib/time';

export const load: PageServerLoad = ({ locals }) => {
	const me = locals.user as App.SafeUser;
	return { digestPreview: digestText(me, todayLocal(me.timezone)) };
};
