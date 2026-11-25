import type { PageServerLoad } from './$types';
import * as users from '$lib/server/repo/users';

export const load: PageServerLoad = ({ locals }) => ({
	feedOn: !!(locals.user && users.byId(locals.user.id)?.icsTokenHash),
});
