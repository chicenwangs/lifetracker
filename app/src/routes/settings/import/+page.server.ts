// Admin: one-time Notion import from SEED_DIR (mounted volume, never baked into the image). FR-IM1..3.
// Card 11 adds the ICS file import: the browser posts the File once for the preview and again on Import
// (no server-side temp copy, D-V4-12). Admin-only, always the signed-in admin's own default calendar.
import { fail } from '@sveltejs/kit';
import { ApiFail, admin } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$lib/server/env';
import { importSeed, readReport } from '$lib/server/seed';
import * as usersRepo from '$lib/server/repo/users';
import * as itemTypesRepo from '$lib/server/repo/itemtypes';
import {
	MAX_BYTES,
	MAX_EVENTS,
	importIcs,
	parseIcs,
	previewFor,
	type IcsParse,
} from '$lib/server/ics-import';

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

type Read = { me: App.SafeUser; fd: FormData; parsed: IcsParse } | { error: string };

/** C1/C8: one place for the file-part size re-check and the 2 000-event refusal */
async function read(event: { locals: App.Locals; request: Request }): Promise<Read> {
	const me = admin(event.locals);
	const fd = await event.request.formData();
	const f = fd.get('file');
	if (!(f instanceof File) || !f.name) return { error: 'Choose a calendar file first.' };
	if (f.size > MAX_BYTES) return { error: 'The file is over 1 MB.' };
	const parsed = parseIcs(await f.text(), me.timezone);
	if (parsed.total > MAX_EVENTS)
		return {
			error: `This file has ${parsed.total} events. The most you can import at once is ${MAX_EVENTS}.`,
		};
	return { me, fd, parsed };
}

/** our own refusals are safe to show inline; anything else (SQL text, paths) stays in the log */
function message(e: unknown): string {
	if (e instanceof ApiFail) return e.message;
	console.error('[ics-import]', e instanceof Error ? e.message : String(e));
	return 'Import failed. Details are in the server log.';
}

export const actions: Actions = {
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
	preview: async ({ locals, request }) => {
		const r = await read({ locals, request });
		if ('error' in r) return fail(400, { icsError: r.error });
		try {
			return { ics: previewFor(r.me.id, r.parsed) };
		} catch (e) {
			return fail(400, { icsError: message(e) });
		}
	},
	import: async ({ locals, request }) => {
		const r = await read({ locals, request });
		if ('error' in r) return fail(400, { icsError: r.error });
		const type = String(r.fd.get('type') ?? '').trim() || null;
		try {
			return { icsDone: importIcs(r.me, r.parsed, type) };
		} catch (e) {
			return fail(400, { icsError: message(e) });
		}
	},
};
