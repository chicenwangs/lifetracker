// Admin: one-time Notion import from SEED_DIR (mounted volume, never baked into the image). FR-IM1..3.
// Card 11 adds the ICS file import: the browser posts the File once for the preview and again on Import
// (no server-side temp copy, D-V4-12). Admin-only, always the signed-in admin's own default calendar.
// Both live in the default action behind an `ics` field, so an old cached page POSTing the bare URL still
// reaches the Notion import (SvelteKit forbids a default action beside named ones).
import { fail } from '@sveltejs/kit';
import { ApiFail, admin } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$lib/server/env';
import { importSeed, readReport } from '$lib/server/seed';
import * as usersRepo from '$lib/server/repo/users';
import * as itemTypesRepo from '$lib/server/repo/itemtypes';
import { MAX_BYTES, MAX_EVENTS, importIcs, parseIcs, previewFor } from '$lib/server/ics-import';

function report() {
	try {
		return readReport(env().SEED_DIR);
	} catch {
		return null;
	}
}

export const load: PageServerLoad = ({ locals }) => {
	const me = admin(locals);
	const types = itemTypesRepo.list(me.id);
	return {
		report: report(),
		users: usersRepo.list().map((u) => ({ username: u.username, name: u.displayName })),
		types: types.map((t) => ({ key: t.key, name: t.name, onCalendar: t.onCalendar })),
		// O-1 items 2–3: the first type hidden on Month, else None
		defaultType: types.find((t) => !t.onCalendar)?.key ?? '',
	};
};

/** our own refusals are safe to show inline; anything else (SQL text, paths) stays in the log */
function message(e: unknown): string {
	if (e instanceof ApiFail) return e.message;
	console.error('[ics-import]', e instanceof Error ? e.message : String(e));
	return 'Import failed. Details are in the server log.';
}

/** C1/C8 + the parser: every throw (including an unreadable date) becomes the inline error, never a 500 */
async function ics(me: App.SafeUser, fd: FormData, importing: boolean) {
	try {
		const f = fd.get('file');
		if (!(f instanceof File) || !f.name) return fail(400, { icsError: 'Choose a calendar file first.' });
		if (f.size > MAX_BYTES) return fail(400, { icsError: 'The file is over 1 MB.' });
		const parsed = parseIcs(await f.text(), me.timezone);
		if (parsed.total > MAX_EVENTS)
			return fail(400, {
				icsError: `This file has ${parsed.total} events. The most you can import at once is ${MAX_EVENTS}.`,
			});
		if (!importing) return { ics: previewFor(me.id, parsed) };
		const type = String(fd.get('type') ?? '').trim() || null;
		return { icsDone: importIcs(me, parsed, type) };
	} catch (e) {
		return fail(400, { icsError: message(e) });
	}
}

function notion(me: App.SafeUser, fd: FormData) {
	const owner = String(fd.get('owner') ?? me.username);
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
}

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const me = admin(locals);
		const fd = await request.formData();
		const kind = String(fd.get('ics') ?? '');
		if (kind === 'preview' || kind === 'import') return ics(me, fd, kind === 'import');
		return notion(me, fd);
	},
};
