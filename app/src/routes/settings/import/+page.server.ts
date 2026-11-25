// Import: Notion seed (admin only, SEED_DIR) + a calendar file (.ics) for every signed-in user (own default calendar).
import { fail } from '@sveltejs/kit';
import { admin } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$lib/server/env';
import { importSeed, readReport } from '$lib/server/seed';
import * as usersRepo from '$lib/server/repo/users';
import * as itemTypes from '$lib/server/repo/itemtypes';
import { ICS_MAX_BYTES, importIcs, previewIcs } from '$lib/server/ics-import';
import { ApiFail } from '$lib/server/http';

function report() {
	try {
		return readReport(env().SEED_DIR);
	} catch {
		return null;
	}
}

export const load: PageServerLoad = ({ locals }) => {
	const me = locals.user as App.SafeUser;
	const isAdmin = me.role === 'admin';
	// v3.3 PR 11: the ICS default type = the first type with "Month calendar" off (e.g. Class), else None
	const types = itemTypes.list(me.id);
	const typeDefault = types.find((t) => (t as { onCalendar?: boolean }).onCalendar === false)?.key ?? '';
	return {
		isAdmin,
		report: isAdmin ? report() : null,
		users: isAdmin ? usersRepo.list().map((u) => ({ username: u.username, name: u.displayName })) : [],
		types: types.map((t) => ({ key: t.key, name: t.name })),
		typeDefault,
	};
};

const icsError = (e: unknown) =>
	fail(400, { icsError: e instanceof ApiFail ? e.message : 'Could not read that calendar file.' });

export const actions: Actions = {
	/** Notion seed import (admin) */
	notion: async ({ locals, request }) => {
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

	/** Calendar file: mode=preview (counts only) or mode=import (+ type) — v3.3 PR 11 */
	ics: async ({ locals, request }) => {
		const me = locals.user as App.SafeUser;
		const f = await request.formData();
		const file = f.get('file');
		if (!(file instanceof File) || !file.name || file.size === 0)
			return fail(400, { icsError: 'Pick a calendar file (.ics) first.' });
		if (file.size > ICS_MAX_BYTES)
			return fail(400, { icsError: 'That file is bigger than 1 MB. Export a shorter date range.' });
		let text: string;
		try {
			text = await file.text();
		} catch {
			return fail(400, { icsError: 'Could not read that file.' });
		}
		try {
			if (String(f.get('mode') ?? '') === 'import') {
				const type = String(f.get('type') ?? '').trim();
				return { icsImported: importIcs(me, text, type || null) };
			}
			return { icsPreview: previewIcs(me, text) };
		} catch (e) {
			return icsError(e);
		}
	},
};
