import type { PageServerLoad } from './$types';
import { graph } from '$lib/server/graph';

export const load: PageServerLoad = ({ locals }) => ({ graph: graph((locals.user as App.SafeUser).id) });
