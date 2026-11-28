// Blind tests for card 14 (type starter pack) on desktop, from its Done-when lines only:
// C2 (button + helper, enabled at 9/10, disabled at 10/10), C3 (five rows in order, colour dots, "(have it)"),
// C4 (one custom type after the last, same name/slug/colour), C5 (HTTP create takes onCalendar), C6 (chip on
// Home/Week, gone from Month, /class fills the Type slot), C7 (slug clash toast), C8 (no duplicate, five fill,
// cap), C11 (no undo on add; the type Delete keeps its own), C12 (SSR/empty/error/offline). No builder test was opened.
import { expect, test, type Page, type Request } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind14 ';
const HELPER_OFF = 'Off = hidden on Month, still on Week, Today and reminders.';
const HELPER_FULL = 'Remove a type to add more';
const PRESETS = ['Class', 'Errand', 'Health', 'Chore', 'Study'];
const BUILTINS = ['Work', 'Deadline', 'Event', 'Hobby', 'Date'];

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

interface TypeDTO {
	id: string;
	key: string;
	name: string;
	bg: string;
	ink: string;
	slug: string;
	position: number;
	builtin: boolean;
	shareDefault: boolean;
	countsDown: boolean;
	isDefault: boolean;
	onCalendar: boolean;
	used?: number;
}
const listTypes = async (): Promise<TypeDTO[]> =>
	((await api(page, 'GET', '/api/item-types')).json as { types: TypeDTO[] }).types;
const addManual = async (name: string, slug: string): Promise<TypeDTO> => {
	const r = await api(page, 'POST', '/api/item-types', { name, bg: '#3D5A80', slug });
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	return (r.json as { type: TypeDTO }).type;
};
const removeType = async (id: string): Promise<void> => {
	const r = await api(page, 'DELETE', `/api/item-types/${id}`, { moveTo: null });
	expect(r.status, JSON.stringify(r.json)).toBe(200);
};
/** the shared e2e DB keeps what earlier specs wrote: every test starts and ends with the five built-ins only */
async function resetTypes(): Promise<void> {
	for (const t of (await listTypes()).filter((x) => !x.builtin)) await removeType(t.id);
	expect((await listTypes()).filter((x) => !x.builtin)).toHaveLength(0);
}
const makeItem = async (fields: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: { id: string } }).item;
	items.push(item.id);
	return item;
};

const presetBtn = () => page.getByRole('button', { name: /Add a preset/ });
const rows = () => page.locator('.presets .preset');
const row = (name: string) => page.locator('.presets .preset', { hasText: name });
const created = () =>
	page.waitForResponse((r) => r.url().endsWith('/api/item-types/presets') && r.request().method() === 'POST');
async function openPresets() {
	await presetBtn().click();
	await expect(page.locator('.presets')).toBeVisible();
}
async function clickPreset(name: string) {
	await row(name).click();
}
/** C4 shows the real pointer already lands on the sticky header for the first row, so a DOM click is the only
 *  way to drive the create inside the other checks (same event a working popover would send). */
const choosePreset = (name: string) => row(name).evaluate((b) => (b as HTMLElement).click());
/** one toast at a time for 5-6 s: any leftover from the test before must go before "no toast" is asserted */
async function clearToast() {
	await page
		.locator('.toast')
		.first()
		.waitFor({ state: 'detached', timeout: 8000 })
		.catch(() => {});
}

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore

/** users/journal straight from the e2e DB (behaviour the screen cannot show) */
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

/** the month grid card on Home (never the planner / due chips) */
const monthCard = () => page.locator('section[aria-label="Calendar"]');
const typeBar = () => page.getByRole('group', { name: 'Item types: show or hide' });

// not serial: each test resets the types, so a FAIL in one still lets the rest report their own result

test.beforeAll(async ({ browser }) => {
	// page.route() / offline and the DB assertions work best without a controlling service worker (#105)
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test.afterEach(async () => {
	for (const id of items.splice(0)) await api(page, 'DELETE', `/api/items/${id}`); // prettier-ignore
	await resetTypes();
});

// ---- C2 ---------------------------------------------------------------------------------------------------
test('C2 Settings › Types: "+ Add a preset ▾" under the list, enabled at 9/10, disabled at 10/10 with its helper', async () => {
	await resetTypes();
	for (let i = 0; i < 4; i++) await addManual(`Blind14 Filler ${i}`, `blind14f${i}`);
	await page.goto('/settings/types');
	await expect(page.getByRole('heading', { name: 'Item types' })).toBeVisible();

	// the button is under the table and the old Month helper is untouched
	await expect(presetBtn()).toBeVisible();
	await expect(presetBtn()).toBeEnabled();
	await expect(page.getByText(HELPER_OFF, { exact: true })).toBeVisible();
	await expect(page.getByText('9 / 10 types')).toBeVisible();
	await expect(page.getByText(HELPER_FULL)).toHaveCount(0);
	expect(
		await page.evaluate(() => {
			const table = document.querySelector('table');
			const button = [...document.querySelectorAll('button')].find((b) => /Add a preset/.test(b.textContent ?? '')); // prettier-ignore
			return !!table && !!button && !!(table.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING); // prettier-ignore
		}),
	).toBe(true);

	// 10/10: disabled, and the helper says what to do instead
	await addManual('Blind14 Filler 4', 'blind14f4');
	await page.reload();
	await expect(presetBtn()).toBeDisabled();
	await expect(page.getByText(HELPER_FULL, { exact: true })).toBeVisible();
	await expect(page.getByText('10 / 10 types')).toBeVisible();
	await presetBtn().evaluate((b) => (b as HTMLElement).click()); // a disabled button opens nothing
	await expect(page.locator('.presets')).toHaveCount(0);

	// back to 9/10: enabled again, the cap helper gone
	const last = (await listTypes()).find((t) => t.name === 'Blind14 Filler 4')!;
	await removeType(last.id);
	await page.reload();
	await expect(presetBtn()).toBeEnabled();
	await expect(page.getByText(HELPER_FULL)).toHaveCount(0);
});

// ---- C3 ---------------------------------------------------------------------------------------------------
test('C3 the menu lists the five presets in card order with colour dots; an exact existing name is disabled with "(have it)"', async () => {
	await resetTypes();
	await addManual('class', 'classlower'); // exact, case-sensitive match (D-V4-54): this does not grey Class
	await page.goto('/settings/types');
	await openPresets();

	await expect(rows()).toHaveCount(5);
	expect(
		await rows().evaluateAll((ns) =>
			ns.map((n) => (n.textContent ?? '').replace('(have it)', '').replace(/\s+/g, ' ').trim()),
		),
	).toEqual(PRESETS);
	// each row has a colour dot (a real background), none is a bare name
	const dots = page.locator('.presets .preset .dot');
	await expect(dots).toHaveCount(5);
	for (const dot of await dots.all()) {
		const bg = await dot.evaluate((n) => getComputedStyle(n).backgroundColor);
		expect(bg).not.toBe('rgba(0, 0, 0, 0)');
		expect(bg).not.toBe('transparent');
	}
	// a name that differs only by case is not "(have it)"
	await expect(row('Class')).toBeEnabled();
	await expect(row('Class')).not.toContainText('(have it)');

	// now the exact name exists: disabled, "(have it)", and a click changes nothing
	await addManual('Class', 'classx');
	await page.reload();
	await openPresets();
	await expect(row('Class')).toBeDisabled();
	await expect(row('Class')).toContainText('(have it)');

	const before = (await listTypes()).map((t) => t.id);
	let posts = 0;
	const watch = (r: Request) => {
		if (r.url().endsWith('/api/item-types/presets') && r.method() === 'POST') posts++;
	};
	page.on('request', watch);
	try {
		await row('Class').evaluate((b) => (b as HTMLElement).click());
		await page.waitForTimeout(400);
		expect(posts).toBe(0);
		expect((await listTypes()).map((t) => t.id)).toEqual(before);
	} finally {
		page.off('request', watch);
	}
});

// ---- C4 ---------------------------------------------------------------------------------------------------
test('C4 choosing Class creates exactly one custom type owned by me, after the last row, name/slug/colour from the preset', async () => {
	await resetTypes();
	await addManual('Blind14 Tail', 'blind14tail'); // a row before the preset: it must land after it
	const before = await listTypes();
	await page.goto('/settings/types');
	await openPresets();
	const dot = await row('Class')
		.locator('.dot')
		.evaluate((n) => getComputedStyle(n).backgroundColor);
	// a real pointer on the first menu row must reach the row (it is the one a user clicks for Class).
	// soft: keep driving the rest of the card's checks even when this fails.
	const box = await row('Class').boundingBox();
	expect(box).not.toBeNull();
	expect
		.soft(
			await page.evaluate(
				({ x, y }) => {
					const el = document.elementFromPoint(x as number, y as number) as HTMLElement | null;
					return el?.closest('.preset')?.textContent?.trim().startsWith('Class') ?? false;
				},
				{ x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
			),
			'the Class row must be the element a click at its centre hits (menu anchored under the button, not under the header)',
		)
		.toBe(true);
	const [resp] = await Promise.all([created(), choosePreset('Class')]);
	expect(resp.status()).toBe(201);
	expect(resp.request().postDataJSON()).toEqual({ slug: 'class' });
	await expect(page.locator('.presets')).toHaveCount(0); // the menu closes on success

	const after = await listTypes();
	expect(after).toHaveLength(before.length + 1);
	const added = after.filter((t) => !before.some((b) => b.id === t.id));
	expect(added).toHaveLength(1);
	const cls = added[0]!;
	expect({
		name: cls.name,
		slug: cls.slug,
		builtin: cls.builtin,
		countsDown: cls.countsDown,
		shareDefault: cls.shareDefault,
		onCalendar: cls.onCalendar,
		key: cls.key,
	}).toEqual({
		name: 'Class',
		slug: 'class',
		builtin: false,
		countsDown: false,
		shareDefault: false,
		onCalendar: false,
		key: cls.id,
	});
	expect(cls.bg).toMatch(/^#[0-9A-F]{6}$/);
	expect(['#00003D', '#FFFFFF']).toContain(cls.ink);
	expect(cls.position).toBe(Math.max(...before.map((t) => t.position)) + 1);
	expect(cls.position).toBe(before.length);
	expect(dbQ<{ owner_id: string }>('SELECT owner_id FROM item_types WHERE id = ?', cls.id).owner_id).toBe(
		dbQ<{ id: string }>('SELECT id FROM users WHERE username = ?', 'jeremy').id,
	);
	// the dot's colour is the created type's colour
	expect(dot).toBe(
		`rgb(${parseInt(cls.bg.slice(1, 3), 16)}, ${parseInt(cls.bg.slice(3, 5), 16)}, ${parseInt(cls.bg.slice(5, 7), 16)})`,
	);

	// no existing type was renamed, recoloured, reordered or deleted
	expect(after.filter((t) => t.id !== cls.id)).toEqual(before);
	await expect(page.getByLabel('Name of Class')).toHaveValue('Class');
});

// ---- C5 ---------------------------------------------------------------------------------------------------
test('C5 POST /api/item-types takes onCalendar (default true) and stores the flag instead of the DB default', async () => {
	await resetTypes();
	const off = await api(page, 'POST', '/api/item-types', {
		name: 'Blind14 Manual Off',
		bg: '#3D5A80',
		slug: 'blind14manualoff',
		onCalendar: false,
	});
	expect(off.status, JSON.stringify(off.json)).toBe(201);
	const offT = (off.json as { type: TypeDTO }).type;
	expect(offT.onCalendar).toBe(false);
	expect(dbQ<{ on_calendar: number }>('SELECT on_calendar FROM item_types WHERE id = ?', offT.id)).toEqual({
		on_calendar: 0,
	});

	// omitted = the old behaviour, and the row says so
	const on = await api(page, 'POST', '/api/item-types', {
		name: 'Blind14 Manual On',
		bg: '#3D5A80',
		slug: 'blind14manualon',
	});
	expect(on.status, JSON.stringify(on.json)).toBe(201);
	const onT = (on.json as { type: TypeDTO }).type;
	expect(onT.onCalendar).toBe(true);
	expect(dbQ<{ on_calendar: number }>('SELECT on_calendar FROM item_types WHERE id = ?', onT.id)).toEqual({
		on_calendar: 1,
	});

	// strict boolean, unknown keys refused (nothing written)
	for (const bad of [
		{ name: 'Blind14 Bad 1', bg: '#112233', slug: 'blind14bad1', onCalendar: 'no' },
		{ name: 'Blind14 Bad 2', bg: '#112233', slug: 'blind14bad2', onCalendar: 1 },
		{ name: 'Blind14 Bad 3', bg: '#112233', slug: 'blind14bad3', on_calendar: false },
		{ name: 'Blind14 Bad 4', bg: '#112233', slug: 'blind14bad4', onCalendar: false, junk: 1 },
	])
		expect((await api(page, 'POST', '/api/item-types', bad)).status, JSON.stringify(bad)).toBe(400);

	// the preset endpoint proves the path C4 uses: Class is 0 in the column
	const preset = await api(page, 'POST', '/api/item-types/presets', { slug: 'class' });
	expect(preset.status, JSON.stringify(preset.json)).toBe(201);
	const presetT = (preset.json as { type: TypeDTO }).type;
	expect(presetT.onCalendar).toBe(false);
	expect(dbQ<{ on_calendar: number }>('SELECT on_calendar FROM item_types WHERE id = ?', presetT.id)).toEqual(
		{
			on_calendar: 0,
		},
	);
});

// ---- C6 ---------------------------------------------------------------------------------------------------
test('C6 the new Class is usable at once: chip on Home and Week, item absent from Month, /class fills the Type slot', async () => {
	await resetTypes();
	await page.goto('/settings/types');
	await openPresets();
	await Promise.all([created(), choosePreset('Class')]);
	const cls = (await listTypes()).find((t) => t.name === 'Class')!;
	const title = PREFIX + `C6 ${Date.now().toString(36)}`;
	await makeItem({ title, type: cls.key, date: await klToday(), time: '10:00' });

	// Home: the type bar has the Class chip, but Class is a Month-off type
	await page.goto('/');
	await expect(typeBar().getByRole('button', { name: 'Class' })).toBeVisible();
	await expect(monthCard().locator('.fc-event').filter({ hasText: title })).toHaveCount(0);

	// Week: the chip and the item are both there
	await page.goto('/week');
	await expect(typeBar().getByRole('button', { name: 'Class' })).toBeVisible();
	await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();

	// Month: absent, never a disabled placeholder
	await page.goto('/month');
	await expect(page.getByText(title)).toHaveCount(0);
	expect(await page.locator('main').innerText()).not.toMatch(/\d+ hidden|hidden on month/i);

	// quick add: /class fills the Type chip of QASlots with the new type's name
	await page.goto('/week');
	await page.locator('body').click({ position: { x: 5, y: 880 } });
	await page.keyboard.press('n');
	await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeVisible();
	await page.keyboard.type(`${PREFIX}C6 quick /class`);
	const typeSlot = page.locator('#qa-slots .s').first();
	await expect(typeSlot).toContainText('Type');
	await expect(typeSlot).toContainText('Class');
	await expect(typeSlot).not.toHaveClass(/(^|\s)d(\s|$)/); // lit, not dashed
});

// ---- C7 ---------------------------------------------------------------------------------------------------
test('C7 a slug clash is skipped and not silent: the bad_slug message names the owner and no type is created', async () => {
	await resetTypes();
	await addManual('Health hub', 'health');
	await page.goto('/settings/types');
	await clearToast();
	await openPresets();
	await clickPreset('Health');

	const alert = page.locator('.toast.error');
	await expect(alert).toBeVisible();
	await expect(alert).toHaveAttribute('role', 'alert');
	await expect(alert).toContainText('/health is used by Health hub.');

	// the page re-read the list: still six types, no second Health
	await expect(page.getByText('6 / 10 types')).toBeVisible();
	expect(await listTypes()).toHaveLength(6);
	expect((await listTypes()).filter((t) => t.name === 'Health')).toHaveLength(0);
	// reopening shows the menu unchanged: Health still available (a failed attempt creates nothing)
	await openPresets();
	await expect(rows()).toHaveCount(5);
	await expect(row('Health')).toBeEnabled();
});

// ---- C8 ---------------------------------------------------------------------------------------------------
test('C8 a repeat click never duplicates; five presets fill five slots (distinct names/slugs), then the cap disables the button', async () => {
	await resetTypes();
	await page.goto('/settings/types');

	// two rapid clicks on one preset: the page guard + slug uniqueness = exactly one POST, one type
	let posts = 0;
	const watch = (r: Request) => {
		if (r.url().endsWith('/api/item-types/presets') && r.method() === 'POST') posts++;
	};
	page.on('request', watch);
	try {
		await openPresets();
		const resp = created();
		await row('Class').evaluate((b) => {
			(b as HTMLElement).click();
			(b as HTMLElement).click();
		});
		expect((await resp).status()).toBe(201);
		await page.waitForTimeout(500);
		expect(posts).toBe(1);
	} finally {
		page.off('request', watch);
	}
	expect((await listTypes()).filter((t) => t.name === 'Class')).toHaveLength(1);

	// the other three one by one: 9/10 now
	for (const name of ['Errand', 'Health', 'Chore']) {
		await openPresets();
		await Promise.all([created(), clickPreset(name)]);
	}
	expect(await listTypes()).toHaveLength(9);

	// every name already on the account is greyed with "(have it)" and does nothing
	await openPresets();
	for (const i of [0, 1, 2, 3]) {
		await expect(rows().nth(i)).toBeDisabled();
		await expect(rows().nth(i)).toContainText('(have it)');
	}
	await expect(rows().nth(4)).toBeEnabled();
	await expect(rows().nth(4)).not.toContainText('(have it)');
	const before = (await listTypes()).length;
	await rows()
		.nth(0)
		.evaluate((b) => (b as HTMLElement).click());
	await page.waitForTimeout(300);
	expect((await listTypes()).length).toBe(before);

	// the fifth fills the last slot: the cap turns the button off (so the fifth "(have it)" row can only be
	// seen at 9/10 above — the cap and the have-it state cannot be on screen at once)
	const last = created();
	await rows().nth(4).click();
	expect((await last).status()).toBe(201);
	await expect(presetBtn()).toBeDisabled();
	await expect(page.getByText(HELPER_FULL, { exact: true })).toBeVisible();
	const all = await listTypes();
	expect(all).toHaveLength(10);
	const added = all.filter((t) => !t.builtin);
	expect(added).toHaveLength(5);
	expect(new Set(added.map((t) => t.slug)).size).toBe(5);
	expect(new Set(added.map((t) => t.name)).size).toBe(5);
	expect(added.map((t) => t.name).sort()).toEqual([...PRESETS].sort());
});

// ---- C11 --------------------------------------------------------------------------------------------------
test('C11 adding a preset writes no undo entry and shows no undo toast; the type Delete keeps its own undo', async () => {
	await resetTypes();
	await page.goto('/settings/types');
	await clearToast();
	const before = undoCount();

	await openPresets();
	const [resp] = await Promise.all([created(), choosePreset('Class')]);
	expect(resp.status()).toBe(201);
	await expect(page.getByLabel('Name of Class')).toHaveValue('Class');

	// no toast at all, so no "Undo" (D-V4-11: type settings keep their no-undo behaviour)
	await expect(page.locator('.toast')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	expect(undoCount()).toBe(before);

	// the reversal is the existing Delete, which still offers its undo
	const classRow = page
		.locator('tbody tr')
		.filter({ has: page.locator('input[aria-label="Name of Class"]') });
	await classRow.getByRole('button', { name: 'Delete', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: /Delete "Class"/ });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Delete and move' }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Deleted type "Class"');
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	expect(undoCount()).toBe(before + 1);
});

// ---- C12 --------------------------------------------------------------------------------------------------
test('C12 states: SSR list (no skeleton), five built-ins, a failed create alerts and re-reads, offline fails and is not queued', async () => {
	await resetTypes();
	await page.goto('/settings/types');
	await expect(page.getByRole('heading', { name: 'Item types' })).toBeVisible();

	// loading = the server-rendered list, never a skeleton spinner
	const html = await (await page.request.get('/settings/types')).text();
	expect(html).toContain('Add a preset');
	expect(html).toContain(HELPER_OFF);
	expect(html.toLowerCase()).not.toContain('skeleton');
	expect(html.toLowerCase()).not.toContain('spinner');
	// empty is impossible: the five built-ins are always rows
	for (const n of BUILTINS) await expect(page.getByLabel(`Name of ${n}`)).toBeVisible();

	// a failed create: the existing showError toast, and the page re-reads the list
	const fail = (url: URL) => url.pathname === '/api/item-types/presets';
	await page.route(fail, (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'boom', message: 'Blind14 failed preset.' } }),
		}),
	);
	try {
		await openPresets();
		await clickPreset('Errand');
		const alert = page.locator('.toast.error');
		await expect(alert).toBeVisible();
		await expect(alert).toHaveAttribute('role', 'alert');
		await expect(alert).toContainText('Blind14 failed preset.');
		await expect(page.getByText('5 / 10 types')).toBeVisible(); // re-read: nothing half-created
	} finally {
		await page.unroute(fail);
	}
	expect(await listTypes()).toHaveLength(5);

	// offline: the usual error toast, the create fails, and it is not queued
	await page.goto('/settings/types');
	await openPresets();
	await page.context().setOffline(true);
	try {
		await clickPreset('Health');
		await expect(page.locator('.toast.error')).toContainText("You're offline. Not saved.");
	} finally {
		await page.context().setOffline(false);
	}
	await page.reload();
	expect(await listTypes()).toHaveLength(5);
	await expect(page.getByLabel('Name of Health')).toHaveCount(0);
});
