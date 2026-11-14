// Old "Shared with me" URL: pages moved into the Pages layout, notes into Keep (v2.0.2).
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(308, '/pages/shared');
