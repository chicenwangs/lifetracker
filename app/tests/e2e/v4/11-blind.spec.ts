// Blind tests for card 11 (.ics calendar file import) on desktop, from its Done-when lines only:
// C1 (client + server size refusal), C2 (preview counts, default type, skipped, shortened, already
// imported), C7 (ordinary rows), C8 (2 000-event refusal), C9 (re-import), C10 (one undo),
// C11 (inline panel, re-posted File), C12 (loading / empty / error / offline). No builder test was
// opened. Parser edge cases (C3-C6) and C13 are unit-tested.
import { expect, test, type Page, type Request } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const RUN = Date.now().toString(36);
const PREFIX = `blind11-${RUN}`;
const uid = (n: string) => `${PREFIX}-${n}`;

let page: Page;

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		for (const pw of [RESET_PW, PW]) {
			await p.fill('#u', 'jeremy');
			await p.fill('#p', pw);
			await p.click('button[type=submit]');
			await p.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!p.url().includes('/login')) break;
		}
	}
	await expect(p).not.toHaveURL(/\/(setup|login)/);
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

interface Reply {
	status: number;
	json: unknown;
}
async function api(p: Page, method: string, path: string, body?: unknown): Promise<Reply> {
	return p.evaluate(
		async ([m, u, b]) => {
			const hasBody = b !== null && b !== undefined;
			const r = await fetch(u as string, {
				method: m as string,
				headers: hasBody ? { 'content-type': 'application/json' } : undefined,
				body: hasBody ? JSON.stringify(b) : undefined,
			});
			return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
		},
		[method, path, body ?? null] as const,
	);
}

interface TypeDTO {
	id: string;
	key: string;
	name: string;
	onCalendar: boolean;
}
const allTypes = async (): Promise<TypeDTO[]> =>
	((await api(page, 'GET', '/api/item-types')).json as { types: TypeDTO[] }).types;
async function setAllOn() {
	for (const t of await allTypes())
		if (!t.onCalendar) await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: true });
}
const typeByKey = async (key: string) => (await allTypes()).find((t) => t.key === key)!;
async function setOnCalendar(key: string, on: boolean) {
	const t = await typeByKey(key);
	const r = await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: on });
	expect(r.status, JSON.stringify(r.json)).toBe(200);
}

// ---- fixture helpers ---------------------------------------------------------------------------------------
const wrap = (...blocks: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//blind 11//EN', ...blocks, 'END:VCALENDAR'].join('\r\n'); // prettier-ignore
const ev = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const ymd = (date: string) => date.replace(/-/g, '');
const at = (date: string, hhmm: string) => `DTSTART:${ymd(date)}T${hhmm.replace(':', '')}00`;
const file = (text: string, name = 'blind11.ics') => ({ name, mimeType: 'text/calendar', buffer: Buffer.from(text) }); // prettier-ignore
const input = () => page.getByLabel('Calendar file (.ics)');
const big = () => page.locator('.preview .big');
const importBtn = (n: number) => page.getByRole('button', { name: `Import ${n}`, exact: true });
const selectedType = () => page.getByLabel('Put them in type');

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const klTomorrow = () =>
	page.evaluate(() =>
		new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(
			new Date(Date.now() + 86_400_000),
		),
	);

/** items/journal/calendars straight from the e2e DB (behaviour the screen cannot show) */
function dbAll<T>(sql: string, ...args: unknown[]): T[] {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return db.prepare(sql).all(...args) as T[];
	} finally {
		db.close();
	}
}
const dbQ = <T>(sql: string, ...args: unknown[]): T => dbAll<T>(sql, ...args)[0]!;
const journalCount = () => dbQ<{ n: number }>('SELECT count(*) AS n FROM undo_actions').n;
const myCal = () =>
	dbQ<{ id: string }>(
		"SELECT id FROM calendars WHERE owner_id = (SELECT id FROM users WHERE username = 'jeremy') AND is_default = 1", // prettier-ignore
	).id;
const rowByUid = (u: string) =>
	dbAll<Record<string, unknown>>('SELECT * FROM items WHERE ics_uid = ? AND deleted_at IS NULL', u)[0];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	// page.route() and the DB assertions work best without a controlling service worker (same as 04/07/10)
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test.afterEach(async () => {
	for (const r of dbAll<{ id: string }>(
		'SELECT id FROM items WHERE ics_uid LIKE ? AND deleted_at IS NULL',
		`${PREFIX}%`,
	))
		await api(page, 'DELETE', `/api/items/${r.id}`);
	await setAllOn(); // a failure in one test must not cascade into the next
});

// ---- C1 ---------------------------------------------------------------------------------------------------
test('C1 a file over 1 000 000 bytes is refused inline before upload, and the server refuses a bypass the same way, writing nothing', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	const posted: string[] = [];
	const watch = (r: Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/settings/import') posted.push(r.url());
	};
	page.on('request', watch);
	try {
		await input().setInputFiles({ ...file(''), buffer: Buffer.alloc(1_000_001, 0x20) });
		const alert = page.locator('.preview .alert');
		await expect(alert).toHaveText('The file is over 1 MB.');
		await expect(page.locator('.toast')).toHaveCount(0); // never a toast
		expect(posted).toEqual([]); // refused before upload
	} finally {
		page.off('request', watch);
	}

	// a bypass of the client: the server re-checks the posted file part against the same 1 000 000 bytes
	const small = await page.evaluate(async () => {
		const fd = new FormData();
		fd.set('ics', 'preview');
		fd.set('file', new File([new Uint8Array(1_000_001)], 'big.ics', { type: 'text/calendar' }));
		const r = await fetch('/settings/import', {
			method: 'POST',
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
			body: fd,
		});
		const text = await r.text();
		return { status: r.status, text };
	});
	expect(small.status, small.text).toBe(200); // SvelteKit action JSON carries the 400 inside the body
	expect(small.text).toContain('"type":"failure"');
	expect(small.text).toContain('"status":400');
	expect(small.text).toContain('The file is over 1 MB.');

	// a part well over the app's 1 048 576-byte body cap is refused too: a 413, or a dropped request
	// because the app answers before reading the whole body - never a success
	const huge = await page.evaluate(async () => {
		try {
			const fd = new FormData();
			fd.set('file', new File([new Uint8Array(1_200_000)], 'huge.ics', { type: 'text/calendar' }));
			const r = await fetch('/settings/import', {
				method: 'POST',
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				body: fd,
			});
			return { status: r.status };
		} catch {
			return { status: 0 };
		}
	});
	expect([0, 413]).toContain(huge.status);

	expect(
		dbQ<{ n: number }>(
			'SELECT count(*) AS n FROM items WHERE ics_uid LIKE ? AND deleted_at IS NULL',
			`${PREFIX}%`,
		).n,
	).toBe(0);
});

// ---- C2 ---------------------------------------------------------------------------------------------------
test('C2 a valid file previews "N events · M repeating · K skipped" with skipped reasons, the default off-Month type, shortened titles, Cancel and Import N', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	await setAllOn();
	await setOnCalendar('Work', false);
	await setOnCalendar('Hobby', false);
	await page.reload();
	await page.waitForLoadState('networkidle');
	const today = await klToday();
	const long = 'L'.repeat(320);
	const text = wrap(
		ev(`UID:${uid('a')}`, 'SUMMARY:Blind11 C2 A', at(today, '09:00')),
		ev(`UID:${uid('b')}`, 'SUMMARY:Blind11 C2 B', at(today, '09:00'), 'RRULE:FREQ=WEEKLY;BYDAY=MO'),
		ev(`UID:${uid('c')}`, `SUMMARY:${long}`, at(today, '09:00')),
		ev(`UID:${uid('a')}`, 'SUMMARY:Blind11 C2 dup', at(today, '10:00')),
		ev('SUMMARY:Blind11 C2 no uid', at(today, '11:00')),
	);

	await input().setInputFiles(file(text));
	await expect(big()).toHaveText('3 events · 1 repeating · 2 skipped');
	await expect(importBtn(3)).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();

	// default = the first type in position order with Month calendar off
	await expect(selectedType()).toHaveValue('Work');
	await expect(page.getByText('1 title shortened to 300 characters.')).toBeVisible();

	// Skipped (K) disclosure: one plain-words reason per skipped event
	const details = page.locator('.preview details');
	await expect(details.locator('summary')).toHaveText('Skipped (2)');
	await details.locator('summary').click();
	const reasons = await details.locator('.skipped li').allInnerTexts();
	expect(reasons).toHaveLength(2);
	expect(reasons.join('\n')).toContain('Blind11 C2 dup');
	expect(reasons.join('\n')).toContain('duplicate UID');
	expect(reasons.join('\n')).toContain('Blind11 C2 no uid');
	expect(reasons.join('\n')).toContain('no ID');

	// Import N is the same N, and the same file now reports what a re-import would update
	await Promise.all([
		page.waitForResponse(
			(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import',
		),
		importBtn(3).click(),
	]);
	await expect(page.locator('.toast')).toContainText('Imported 3 events');
	await input().setInputFiles(file(text));
	await expect(big()).toHaveText('3 events · 1 repeating · 2 skipped');
	await expect(page.getByText('Already imported: 3 will be updated')).toBeVisible();
	await expect(importBtn(3)).toBeEnabled();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(big()).toHaveCount(0); // Cancel drops the preview
});

// ---- C7 ---------------------------------------------------------------------------------------------------
test('C7 Import creates ordinary todo items in my default calendar with the chosen type, source NULL, ics_uid, no reminders, and they show on Today and Week', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	const today = await klToday();
	const timed = uid('timed');
	const day = uid('day');
	const text = wrap(
		ev(`UID:${timed}`, 'SUMMARY:Blind11 C7 timed', at(today, '09:00')),
		ev(`UID:${day}`, 'SUMMARY:Blind11 C7 all day', `DTSTART;VALUE=DATE:${ymd(today)}`),
	);
	await input().setInputFiles(file(text));
	await expect(big()).toHaveText('2 events · 0 repeating · 0 skipped');
	await selectedType().selectOption('Event');
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(2).click()]); // prettier-ignore
	await expect(page.locator('.toast')).toContainText('Imported 2 events');

	const mine = rowByUid(timed)!;
	const allDay = rowByUid(day)!;
	expect(mine).toBeTruthy();
	expect(allDay).toBeTruthy();
	for (const row of [mine, allDay]) {
		expect(row).toMatchObject({
			calendar_id: myCal(),
			type: 'Event',
			status: 'todo',
			source: null,
			repeat_from_completion: 0,
		});
	}
	expect(mine).toMatchObject({ title: 'Blind11 C7 timed', date: today, time: '09:00' });
	expect(allDay).toMatchObject({ title: 'Blind11 C7 all day', date: today, time: null });
	expect(
		dbQ<{ n: number }>('SELECT count(*) AS n FROM reminders WHERE source_id IN (?, ?)', mine.id, allDay.id).n,
	).toBe(0);
	// never another calendar
	expect(
		dbQ<{ n: number }>(
			'SELECT count(*) AS n FROM items WHERE ics_uid LIKE ? AND calendar_id <> ? AND deleted_at IS NULL',
			`${PREFIX}%`,
			myCal(),
		).n,
	).toBe(0);

	await page.goto('/today');
	await expect(page.getByText('Blind11 C7 timed').filter({ visible: true }).first()).toBeVisible();
	await page.goto('/week');
	await expect(page.getByText('Blind11 C7 timed').filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByText('Blind11 C7 all day').filter({ visible: true }).first()).toBeVisible();
});

// ---- C8 ---------------------------------------------------------------------------------------------------
test('C8 more than 2 000 VEVENTs refuses the whole import inline with the count and writes nothing', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	const text = wrap(
		...Array.from({ length: 2_001 }, (_, i) =>
			ev(`UID:${uid(`many-${i}`)}`, `SUMMARY:Blind11 many ${i}`, at('2026-03-02', '09:00')),
		),
	);
	const before = journalCount();
	await input().setInputFiles(file(text, 'many.ics'));
	const alert = page.locator('.preview .alert');
	await expect(alert).toContainText('2001 events');
	await expect(alert).toContainText('2000');
	await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0);
	expect(importBtn(2001)).toHaveCount(0);
	expect(
		dbQ<{ n: number }>(
			'SELECT count(*) AS n FROM items WHERE ics_uid LIKE ? AND deleted_at IS NULL',
			`${PREFIX}%`,
		).n,
	).toBe(0);
	expect(journalCount()).toBe(before);
});

// ---- C9 ---------------------------------------------------------------------------------------------------
test('C9 re-import updates title/time/rule/exdates by UID but never the date, inserts new UIDs, leaves missing UIDs alone, and does not match a trashed row', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	const today = await klToday();
	const tomorrow = await klTomorrow();
	const keep = uid('keep');
	const first = wrap(ev(`UID:${keep}`, 'SUMMARY:Blind11 C9 orig', at(today, '09:00'), 'RRULE:FREQ=WEEKLY;BYDAY=MO')); // prettier-ignore
	await input().setInputFiles(file(first));
	await expect(importBtn(1)).toBeEnabled();
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(1).click()]); // prettier-ignore
	await expect(page.locator('.toast')).toContainText('Imported 1 event');
	const before = rowByUid(keep)!;

	const second = wrap(
		ev(
			`UID:${keep}`,
			'SUMMARY:Blind11 C9 new',
			at(tomorrow, '10:30'),
			'RRULE:FREQ=DAILY',
			`EXDATE:${ymd(tomorrow)}`,
		),
		ev(`UID:${uid('extra')}`, 'SUMMARY:Blind11 C9 extra', at(today, '09:00')),
	);
	await input().setInputFiles(file(second, 'again.ics'));
	await expect(big()).toHaveText('2 events · 1 repeating · 0 skipped');
	await expect(page.getByText('Already imported: 1 will be updated')).toBeVisible();
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(2).click()]); // prettier-ignore
	await expect(page.locator('.toast')).toContainText('Imported 2 events');

	const updated = rowByUid(keep)!;
	expect(updated.id).toBe(before.id); // never a second row
	expect(updated).toMatchObject({
		title: 'Blind11 C9 new',
		time: '10:30',
		rrule: 'FREQ=DAILY',
		date: today, // date is never updated
	});
	expect(JSON.parse(String(updated.exdates))).toEqual([tomorrow]);

	// a UID absent from the new file is left untouched (no silent delete)
	const third = wrap(ev(`UID:${uid('third')}`, 'SUMMARY:Blind11 C9 third', at(today, '11:00')));
	await input().setInputFiles(file(third, 'third.ics'));
	await expect(page.getByText(/Already imported/)).toHaveCount(0);
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(1).click()]); // prettier-ignore
	expect(rowByUid(keep)).toMatchObject({ title: 'Blind11 C9 new', time: '10:30' });

	// a trashed row with that UID is left alone and does not match: a re-import inserts a fresh row
	await api(page, 'DELETE', `/api/items/${before.id}`);
	await input().setInputFiles(file(wrap(ev(`UID:${keep}`, 'SUMMARY:Blind11 C9 back', at(today, '12:00'))), 'back.ics')); // prettier-ignore
	await expect(big()).toHaveText('1 event · 0 repeating · 0 skipped');
	await expect(page.getByText(/Already imported/)).toHaveCount(0);
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(1).click()]); // prettier-ignore
	await expect(page.locator('.toast')).toContainText('Imported 1 event');
	const fresh = rowByUid(keep)!;
	expect(fresh.id).not.toBe(before.id);
	expect(fresh.title).toBe('Blind11 C9 back');
	expect(
		dbQ<{ n: number }>('SELECT count(*) AS n FROM items WHERE ics_uid = ? AND deleted_at IS NOT NULL', keep)
			.n,
	).toBe(1);
});

// ---- C10 --------------------------------------------------------------------------------------------------
test('C10 the import is one undo entry and the toast Undo removes every inserted row and restores the updated one in one action', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	const today = await klToday();
	const keep = uid('undo-keep');
	await input().setInputFiles(file(wrap(ev(`UID:${keep}`, 'SUMMARY:Blind11 C10 orig', at(today, '09:00')))));
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(1).click()]); // prettier-ignore
	await expect(page.locator('.toast')).toContainText('Imported 1 event');

	const journal = journalCount();
	const next = wrap(
		ev(`UID:${keep}`, 'SUMMARY:Blind11 C10 changed', at(today, '11:00')),
		ev(`UID:${uid('undo-new1')}`, 'SUMMARY:Blind11 C10 new 1', at(today, '09:00')),
		ev(`UID:${uid('undo-new2')}`, 'SUMMARY:Blind11 C10 new 2', at(today, '09:00')),
	);
	await input().setInputFiles(file(next, 'next.ics'));
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import'), importBtn(3).click()]); // prettier-ignore
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Imported 3 events');
	expect(journalCount()).toBe(journal + 1); // one entry for the whole import
	expect(
		dbQ<{ label: string }>('SELECT label FROM undo_actions ORDER BY created_at DESC, rowid DESC LIMIT 1')
			.label,
	).toBe('Import 3 events');

	await Promise.all([
		page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/undo')),
		toast.getByRole('button', { name: 'Undo' }).click(),
	]);
	expect(rowByUid(uid('undo-new1'))).toBeUndefined(); // every inserted row is gone
	expect(rowByUid(uid('undo-new2'))).toBeUndefined();
	expect(rowByUid(keep)).toMatchObject({ title: 'Blind11 C10 orig', time: '09:00' });
	expect(journalCount()).toBe(journal + 1); // one action, marked undone - no second entry
	expect(dbQ<{ n: number }>('SELECT count(*) AS n FROM undo_actions WHERE undone_at IS NULL').n).toBe(
		journal,
	);
});

// ---- C11 ---------------------------------------------------------------------------------------------------
test('C11 the preview is an inline panel in the Import page (not a dialog); Import re-posts the kept File with the chosen type; Cancel drops it', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('link', { name: 'Import', exact: true })).toBeVisible();
	const panel = page
		.locator('section.panel')
		.filter({ has: page.getByRole('heading', { name: 'Calendar file (.ics)' }) });
	await expect(panel).toBeVisible();
	await expect(panel.locator('input[type=file]')).toHaveCount(1);

	const marker = `Blind11 C11 repost ${RUN}`;
	await input().setInputFiles(file(wrap(ev(`UID:${uid('c11')}`, `SUMMARY:${marker}`, at('2026-03-02', '09:00'))))); // prettier-ignore
	await expect(big()).toHaveText('1 event · 0 repeating · 0 skipped');
	await expect(page.getByRole('dialog')).toHaveCount(0); // inline panel, not Dialog.svelte
	await expect(panel.locator('.preview .big')).toBeVisible();
	await selectedType().selectOption('Hobby');

	// the browser keeps the File and posts it again on Import, with the chosen type: the import action has
	// no server-side temp copy, so the multipart body must carry the file and the type
	let posted = '';
	let contentType = '';
	const importUrl = (url: URL) => url.pathname === '/settings/import';
	await page.route(importUrl, async (route) => {
		if (route.request().method() === 'POST') {
			posted = (await route.request().postDataBuffer())?.toString('utf8') ?? '';
			contentType = route.request().headers()['content-type'] ?? '';
		}
		await route.continue();
	});
	try {
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/settings/import',
			),
			importBtn(1).click(),
		]);
	} finally {
		await page.unroute(importUrl);
	}
	expect(contentType).toContain('multipart/form-data');
	expect(posted).toMatch(/name="type"[\s\S]*Hobby/);
	expect(posted).toMatch(/name="file"; filename="blind11\.ics"/);
	expect(posted).toContain(marker);
	await expect(page.locator('.toast')).toContainText('Imported 1 event');

	// Cancel drops the preview and clears the input, no request
	await input().setInputFiles(file(wrap(ev(`UID:${uid('c11b')}`, 'SUMMARY:Blind11 C11 cancel', at('2026-03-02', '09:00'))))); // prettier-ignore
	await expect(big()).toBeVisible();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(big()).toHaveCount(0);
	expect(await input().evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)).toBe(0);
});

// ---- C12 ---------------------------------------------------------------------------------------------------
test('C12 states: "Reading file…" while the preview loads, "No events in this file." with Import disabled, an inline error with Choose another file, and the offline message with the input disabled', async () => {
	await page.goto('/settings/import');
	await page.waitForLoadState('networkidle');
	const previewUrl = (url: URL) => url.pathname === '/settings/import'; // the default action carries ?ics=preview in the body
	const valid = wrap(ev(`UID:${uid('c12')}`, 'SUMMARY:Blind11 C12', at('2026-03-02', '09:00'))); // prettier-ignore

	// loading: the inline "Reading file…" sits in the preview area while the action is in flight
	await page.route(previewUrl, async (route) => {
		if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 400));
		await route.continue();
	});
	try {
		await input().setInputFiles(file(valid));
		await expect(page.locator('.preview').getByText('Reading file…')).toBeVisible();
		await expect(big()).toHaveText('1 event · 0 repeating · 0 skipped');
	} finally {
		await page.unroute(previewUrl);
	}

	// empty: no VEVENT at all
	await input().setInputFiles(file(wrap(), 'empty.ics'));
	await expect(big()).toHaveText('0 events · 0 repeating · 0 skipped');
	await expect(page.getByText('No events in this file.')).toBeVisible();
	await expect(importBtn(0)).toBeDisabled();

	// error: a real server refusal renders as an inline .alert with the server message, never a toast
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(input()).toBeEnabled();
	await page.evaluate(() =>
		(document.querySelector('input[name="ics"][value="preview"]') as HTMLInputElement).form?.requestSubmit(),
	);
	await expect(page.locator('.preview .alert')).toHaveText('Choose a calendar file first.');
	await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0);
	await page.reload();
	await page.waitForLoadState('networkidle');

	// offline: the page reads navigator.onLine itself and disables the file input
	await page.context().setOffline(true);
	try {
		await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
		await expect(input()).toBeDisabled();
	} finally {
		await page.context().setOffline(false);
	}
	await expect(page.getByText("You're offline", { exact: true })).toHaveCount(0);
	await expect(input()).toBeEnabled();
});
