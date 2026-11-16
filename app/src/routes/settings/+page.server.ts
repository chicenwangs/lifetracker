import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// desktop: straight to Account (as before). Phones get the section list (#100); a big-screen Android tablet
// that lands here is sent on by the page itself.
export const load: PageServerLoad = ({ request }) => {
	if (!/Mobi|Android/i.test(request.headers.get('user-agent') ?? '')) redirect(307, '/settings/account');
};
