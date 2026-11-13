import type { PageServerLoad } from './$types';
import * as itemTypes from '$lib/server/repo/itemtypes';

export const load: PageServerLoad = ({ locals }) => ({
	types: itemTypes.listWithUse((locals.user as App.SafeUser).id),
});
