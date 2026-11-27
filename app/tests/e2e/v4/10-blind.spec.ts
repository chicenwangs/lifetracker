// Blind tests for card 10 (per-type `Month calendar` flag) on desktop, from its Done-when lines only:
// C1 (HTTP PATCH/GET contract), C2 (settings switch + reload), C3 (month grid filter, client-side), C5 (shown
// everywhere else), C7 (no hidden counter), C8 (round trip, no rows written), C10 (no undo), C11 (error state,
// No type, SSR). No builder test was opened. Partner-row filtering (C6) and own() 404 (C12) are unit-tested.
import { expect, test, type Page, type Request } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind10 ';
const BUILTINS = ['Work', 'Deadline', 'Event', 'Hobby', 'Date'];
const HELPER = 'Off = hidden on Month, still on Week, Today and reminders.';

let page: Page;
const items: string[] = [];

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

interface Item {
	id: string;
	title: string;
	type: string | null;
	date: string | null;
}
interface TypeDTO {
	id: string;
	key: string;
	name: string;
	bg: string;
	slug: string;
	used?: number;
	onCalendar: boolean;
}
const listTypes = async (): Promise<TypeDTO[]> =>
	((await api(page, 'GET', '/api/item-types')).json as { types: TypeDTO[] }).types;
const typeByName = async (name: string): Promise<TypeDTO> => {
	const t = (await listTypes()).find((x) => x.name === name);
	expect(t, name).toBeTruthy();
	return t!;
};
const setOnCalendar = async (t: TypeDTO, on: boolean) => {
	const r = await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: on });
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return (r.json as { type: TypeDTO }).type;
};
async function make(fields: Record<string, unknown>): Promise<Item> {
	const r = await api(page, 'POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: Item }).item;
	items.push(item.id);
	return item;
}

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const klYesterday = () =>
	page.evaluate(() =>
		new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(
			new Date(Date.now() - 86_400_000),
		),
	);

/** users/journal/rows straight from the e2e DB (behaviour the screen cannot show) */
function dbQ<T>(sql: string, ...args: unknown[]): T {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return db.prepare(sql).get(...args) as T;
	} finally {
		db.close();
	}
}
const undoCount = () => dbQ<{ n: number }>('SELECT count(*) AS n FROM undo_actions').n;
const rowCounts = () =>
	dbQ<{ i: number; b: number }>('SELECT (SELECT count(*) FROM items) AS i, (SELECT count(*) FROM blocks) AS b'); // prettier-ignore

/** the calendar card on Home (month grid only, never the planner / due chips) */
const monthCard = () => page.locator('section[aria-label="Calendar"]');
const chip = (title: string) => monthCard().locator('.fc-event').filter({ hasText: title });
async function openHome() {
	await page.goto('/');
	await expect(monthCard().locator('.fc-daygrid-day').first()).toBeVisible();
}
const sw = (name: string) => page.getByRole('switch', { name: `Month calendar for ${name}` });
/** the same title can exist in a hidden phone/desktop twin, and the Week chip prefixes its time: substring,
 * only a visible match counts */
const shownText = (title: string) => page.getByText(title).filter({ visible: true });
const patchDone = () =>
	page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/item-types\/[^/]+$/.test(r.url()));

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	// page.route() and the DB assertions work best without a controlling service worker (same as 04/07-blind)
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test.afterEach(async () => {
	for (const id of items.splice(0)) await api(page, 'DELETE', `/api/items/${id}`); // prettier-ignore
	// leave every type on, so a failure in one test cannot cascade into the next
	for (const t of await listTypes()) if (!t.onCalendar) await setOnCalendar(t, true);
});

// ---- C1 ---------------------------------------------------------------------------------------------------
test('C1 /api/item-types returns onCalendar and PATCH takes only a boolean beside the other flags', async () => {
	const all = await listTypes();
	expect(all.length).toBeGreaterThanOrEqual(5);
	for (const t of all) expect(typeof t.onCalendar, t.name).toBe('boolean');
	for (const n of BUILTINS) expect((await typeByName(n)).onCalendar, n).toBe(true);

	const work = await typeByName('Work');
	// beside the fields the schema already took (values that keep Work visually the same)
	const ok = await api(page, 'PATCH', `/api/item-types/${work.id}`, {
		onCalendar: false,
		countsDown: false,
		shareDefault: false,
	});
	expect(ok.status, JSON.stringify(ok.json)).toBe(200);
	expect((ok.json as { type: TypeDTO }).type.onCalendar).toBe(false);
	expect((await typeByName('Work')).onCalendar).toBe(false); // the list route agrees

	// strict zod and boolean: a string, a number, null and an unknown key are refused
	for (const bad of [
		{ onCalendar: 'yes' },
		{ onCalendar: 1 },
		{ onCalendar: null },
		{ onCalendar: false, junk: 1 },
	]) {
		const r = await api(page, 'PATCH', `/api/item-types/${work.id}`, bad);
		expect(r.status, JSON.stringify(bad)).toBe(400);
	}
	expect((await typeByName('Work')).onCalendar).toBe(false); // the refused writes changed nothing

	expect((await setOnCalendar(work, true)).onCalendar).toBe(true);
});

// ---- C2 ---------------------------------------------------------------------------------------------------
test('C2 Settings › Types: a Month calendar switch per row, on by default, saved through save({ onCalendar }) and kept on reload', async () => {
	await page.goto('/settings/types');
	await expect(page.getByRole('heading', { name: 'Item types' })).toBeVisible();

	// one new column in the existing table, and the helper line under the list
	await expect(page.getByRole('columnheader', { name: 'Month calendar' })).toHaveCount(1);
	await expect(page.getByText(HELPER, { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

	// every built-in row has the switch, on (the migration default / old behaviour)
	for (const n of BUILTINS) await expect(sw(n), n).toBeChecked();

	// toggling goes through the page's existing save(t, { onCalendar }) path: exactly that one key
	const [req, resp] = await Promise.all([page.waitForRequest(/\/api\/item-types\/[^/]+$/), patchDone(), sw('Work').uncheck()]); // prettier-ignore
	expect(req.method()).toBe('PATCH');
	expect(req.postDataJSON()).toEqual({ onCalendar: false });
	expect(resp.status()).toBe(200);
	await expect(sw('Work')).not.toBeChecked();

	// a reload shows the stored value (no separate Save button, nothing to confirm)
	await page.reload();
	await expect(sw('Work')).not.toBeChecked();
	await expect(sw('Deadline')).toBeChecked();
	expect((await typeByName('Work')).onCalendar).toBe(false);

	// and the switch itself is enough to put it back
	await Promise.all([patchDone(), sw('Work').check()]);
	await page.reload();
	await expect(sw('Work')).toBeChecked();
});

// ---- C3 ---------------------------------------------------------------------------------------------------
test('C3 desktop month grid: my off-type chips are gone, other items render as today, and the filter makes no request', async () => {
	const today = await klToday();
	const stamp = Date.now().toString(36);
	const w = PREFIX + `C3 work ${stamp}`;
	const e = PREFIX + `C3 event ${stamp}`;
	await make({ title: w, type: 'Work', date: today });
	await make({ title: e, type: 'Event', date: today });

	await openHome();
	await expect(chip(w)).toHaveCount(1);
	await expect(chip(e)).toHaveCount(1);

	await setOnCalendar(await typeByName('Work'), false);
	// no /api/item-types call while the month grid renders: it reads typesState from the layout load
	const apiCalls: string[] = [];
	const watch = (r: Request) => {
		if (r.url().includes('/api/item-types')) apiCalls.push(r.url());
	};
	page.on('request', watch);
	try {
		await openHome();
		await expect(chip(e)).toHaveCount(1); // all other items render exactly as today
		await expect(chip(w)).toHaveCount(0);
		await expect(monthCard().locator('.fc-event').filter({ hasText: PREFIX })).toHaveCount(1);
		expect(apiCalls).toEqual([]);
	} finally {
		page.off('request', watch);
	}
});

// ---- C5 ---------------------------------------------------------------------------------------------------
test('C5 shown everywhere else while off: Week, Today, item page, due chips, widgets, search and the ICS feed', async () => {
	const today = await klToday();
	const title = PREFIX + `C5 ${Date.now().toString(36)}`;
	const slipped = PREFIX + `C5 slipped ${Date.now().toString(36)}`;
	const item = await make({ title, type: 'Work', date: today, time: '10:00' });
	await make({ title: slipped, type: 'Work', date: await klYesterday() }); // overdue one-off
	await setOnCalendar(await typeByName('Work'), false);

	// Week: the item is still in the grid
	await page.goto('/week');
	await expect(shownText(title).first()).toBeVisible();

	// Today: timed item row
	await page.goto('/today');
	await expect(shownText(title).first()).toBeVisible();

	// the item page itself
	await page.goto(`/item/${item.id}`);
	await expect(page.locator('h1.title')).toContainText(title);

	// due-today chips on Home, and Slipped (overdue list) keeps the hidden type too
	await openHome();
	await expect(page.locator('.due').getByText(title, { exact: true })).toBeVisible();
	await expect(
		page.locator('section[aria-label="Slipped"]').getByText(slipped, { exact: true }),
	).toBeVisible();

	// widgets (/api/native) and planner-item search
	const native = (await api(page, 'GET', '/api/native')).json as { rows: { title: string }[] };
	expect(native.rows.some((r) => r.title === title)).toBe(true);
	const search = (await api(page, 'GET', `/api/search?q=${encodeURIComponent(title)}`)).json as {
		items: { title: string }[];
	};
	expect(search.items.some((r) => r.title === title)).toBe(true);

	// ICS feed: the type is off Month but still exported
	await page.goto('/settings/calendar-feed');
	const create = page.getByRole('button', { name: 'Create feed link' });
	if (await create.isVisible().catch(() => false)) await create.click();
	else await page.getByRole('button', { name: 'Rotate' }).click();
	const code = page.getByLabel('Your calendar feed link');
	await expect(code).toBeVisible();
	const url = (await code.innerText()).trim();
	const feed = await page.request.get(url);
	expect(feed.status()).toBe(200);
	expect(await feed.text()).toContain(`SUMMARY:${title}`);
	await page.getByRole('button', { name: 'Turn off' }).click();
});

// ---- C7 ---------------------------------------------------------------------------------------------------
test('C7 no hidden hint: a day whose only item is hidden looks exactly like an empty day on the month grid', async () => {
	const today = await klToday();
	const month = today.slice(0, 7);
	const day = `${month}-12`;
	const control = `${month}-13`;
	const title = PREFIX + `C7 ${Date.now().toString(36)}`;
	const other = PREFIX + `C7 control ${Date.now().toString(36)}`;
	await make({ title, type: 'Work', date: day });
	await make({ title: other, type: 'Event', date: control }); // gate: the grid really rendered
	await setOnCalendar(await typeByName('Work'), false);

	await openHome();
	await expect(chip(other)).toHaveCount(1);
	const cell = monthCard().locator(`.fc-daygrid-day[data-date="${day}"]`);
	await expect(cell).toBeVisible();
	await expect(cell.locator('.fc-event')).toHaveCount(0);
	await expect(cell.locator('.fc-daygrid-more-link')).toHaveCount(0);
	// numbers and nothing else: no "+N hidden", no empty marker, no tooltip text
	expect((await cell.innerText()).trim()).toBe(String(Number(day.slice(8))));
	expect(await page.locator('body').innerText()).not.toMatch(/hidden on month|\+ ?\d+ ?hidden/i);
});

// ---- C8 ---------------------------------------------------------------------------------------------------
test('C8 round trip through the switch: off leaves Month but stays Week and Today, on brings it back, no item/block row is written', async () => {
	const today = await klToday();
	const stamp = Date.now().toString(36);
	const title = PREFIX + `C8 ${stamp}`;
	const control = PREFIX + `C8 control ${stamp}`;
	const item = await make({ title, type: 'Work', date: today, time: '10:00' });
	await make({ title: control, type: 'Event', date: today, time: '11:00' }); // gate: the grid really rendered
	const work = await typeByName('Work');
	const beforeType = { name: work.name, bg: work.bg, slug: work.slug, used: work.used };
	const beforeCounts = rowCounts();
	const beforeRow = dbQ<Record<string, unknown>>(
		'SELECT title, type, date, updated_at, deleted_at FROM items WHERE id = ?',
		item.id,
	);

	await page.goto('/settings/types');
	await Promise.all([patchDone(), sw('Work').uncheck()]);
	await expect(sw('Work')).not.toBeChecked();

	await openHome();
	await expect(chip(control)).toHaveCount(1);
	await expect(chip(title)).toHaveCount(0);
	await page.goto('/week');
	await expect(shownText(title).first()).toBeVisible();
	await page.goto('/today');
	await expect(shownText(title).first()).toBeVisible();

	await page.goto('/settings/types');
	await Promise.all([patchDone(), sw('Work').check()]);
	await expect(sw('Work')).toBeChecked();
	await openHome();
	await expect(chip(control)).toHaveCount(1);
	await expect(chip(title)).toHaveCount(1);

	// nothing but item_types.on_calendar moved
	expect(rowCounts()).toEqual(beforeCounts);
	expect(
		dbQ<Record<string, unknown>>(
			'SELECT title, type, date, updated_at, deleted_at FROM items WHERE id = ?',
			item.id,
		),
	).toEqual(beforeRow);
	const afterType = await typeByName('Work');
	expect({ name: afterType.name, bg: afterType.bg, slug: afterType.slug, used: afterType.used }).toEqual(
		beforeType,
	);
});

// ---- C10 --------------------------------------------------------------------------------------------------
test('C10 no undo: the switch adds no journal entry and no undo toast; the switch itself is the reversal', async () => {
	await page.goto('/settings/types');
	const before = undoCount();

	await Promise.all([patchDone(), sw('Work').uncheck()]);
	await expect(sw('Work')).not.toBeChecked();
	await expect(page.locator('.toast')).toHaveCount(0);

	await Promise.all([patchDone(), sw('Work').check()]);
	await expect(sw('Work')).toBeChecked();
	await expect(page.locator('.toast')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);

	expect(undoCount()).toBe(before);
});

// ---- C11 ---------------------------------------------------------------------------------------------------
test('C11 states: SSR types page, no switch for No type, five built-ins always there, a failed PATCH alerts and reverts', async () => {
	// the page is server-rendered: the switch and helper are in the HTML, never a skeleton
	const html = await (await page.request.get('/settings/types')).text();
	expect(html).toContain('Month calendar');
	expect(html).toContain(HELPER);
	expect(html.toLowerCase()).not.toContain('skeleton');
	expect(html.toLowerCase()).not.toContain('spinner');

	await page.goto('/settings/types');
	// "No type" is not a row, so it has no switch; it never appears in the type list
	await expect(page.getByRole('switch', { name: /No type/i })).toHaveCount(0);
	for (const n of BUILTINS) await expect(sw(n), n).toHaveCount(1); // empty is impossible

	// a failed PATCH: the page's showError toast, then the switch returns to the stored value
	await expect(sw('Work')).toBeChecked();
	const fail = (url: URL) => /\/api\/item-types\/[^/]+$/.test(url.pathname);
	await page.route(fail, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'boom', message: 'Blind10 failed PATCH.' } }),
				})
			: route.fallback(),
	);
	try {
		await sw('Work').uncheck();
		const alert = page.locator('.toast.error');
		await expect(alert).toBeVisible();
		await expect(alert).toHaveAttribute('role', 'alert');
		await expect(alert).toContainText('Blind10 failed PATCH.');
		await expect(sw('Work')).toBeChecked(); // invalidateAll put the stored value back
	} finally {
		await page.unroute(fail);
	}
	expect((await typeByName('Work')).onCalendar).toBe(true);
});
