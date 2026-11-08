// Admin: one-time Notion import from SEED_DIR (mounted volume, never baked into the image). FR-IM1..3.
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$lib/server/env';
import { importSeed, readReport } from '$lib/server/seed';
import * as usersRepo from '$lib/server/repo/users';

function admin(locals: App.Locals): App.SafeUser {
	const u = locals.user;
	if (!u || u.role !== 'admin') error(404, { code: 'not_found', message: 'Not found' });
	return u;
}

function report() {
	try {
		return readReport(env().SEED_DIR);
	} catch {
		return null;
	}
}

export const load: PageServerLoad = ({ locals }) => {
	admin(locals);
	return {
		report: report(),
		users: usersRepo.list().map((u) => ({ username: u.username, name: u.displayName })),
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const me = admin(locals);
		const owner = String((await request.formData()).get('owner') ?? me.username);
		try {
			const r = importSeed(env().SEED_DIR, owner);
			return { result: { inserted: r.inserted, updated: r.updated, counts: r.counts, warnings: r.warnings } };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[import]', msg);
			// our own checks are safe to show; anything else (fs paths, SQL text) stays in the log
			const known = !(e instanceof Error && e.name === 'SqliteError') && !msg.includes('/');
			return fail(400, { message: known ? msg : 'Import failed. Details are in the server log.' });
		}
	},
};
