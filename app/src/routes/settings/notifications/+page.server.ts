// Settings › Notifications (card 12, D-V4-30): the Daily agenda preview is rendered once on the server for the
// signed-in user's today — it is not live, so items added later show on the next load, not in place.
import type { PageServerLoad } from './$types';
import { digestText } from '$lib/server/digest';
import { todayLocal } from '$lib/time';

export const load: PageServerLoad = ({ locals }) => {
	const me = locals.user as App.SafeUser;
	return { digestPreview: digestText(me, todayLocal(me.timezone)) };
};
