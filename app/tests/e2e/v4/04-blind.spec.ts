// Blind tests for card 04, from its Done-when lines only (desktop): C3–C6, C8, C10–C13.
// C1/C2/C5 query rules live in tests/unit/v4-04-blind.test.ts; C7/C8/C9 phone in
// tests/e2e/phone/v4-04-blind.spec.ts. No builder test was opened.
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind04 ';

let page: Page;
const created: string[] = [];

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

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

interface ApiReply {
	status: number;
	json: unknown;
}
async function api(p: Page, method: string, path: string, body?: unknown): Promise<ApiReply> {
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
	date: string | null;
	endDate: string | null;
	time: string | null;
	status: string;
}
async function getItem(id: string): Promise<Item> {
	const r = await api(page, 'GET', `/api/items/${encodeURIComponent(id)}`);
	return (r.json as { item: Item }).item;
}
async function make(fields: Record<string, unknown>): Promise<Item> {
	const r = await api(page, 'POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: Item }).item;
	created.push(item.id);
	return item;
}
async function calendarItems(from: string, to: string): Promise<Item[]> {
	const r = await api(page, 'GET', `/api/calendar?from=${from}&to=${to}`);
	return (r.json as { items: Item[] }).items;
}
const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const addDays = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** the app's prettyDate: "Mon 30 Nov 2026" */
function pretty(date: string) {
	const t = new Date(`${date}T00:00:00Z`);
	const wd = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
	return `${WD[wd - 1]} ${String(t.getUTCDate()).padStart(2, '0')} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; // prettier-ignore
}

/** remove my own rows so no test sees another test's leftovers */
async function sweep() {
	const today = await klToday();
	const rows = await calendarItems(addDays(today, -60), addDays(today, 1));
	for (const r of rows) if (r.title.startsWith(PREFIX)) await api(page, 'DELETE', `/api/items/${r.id}`); // prettier-ignore
}
test.beforeEach(() => sweep());
test.afterEach(async () => {
	for (const id of created.splice(0)) await api(page, 'DELETE', `/api/items/${id}`); // prettier-ignore
});

const slip = () => page.locator('section[aria-label="Slipped"]');
const rowOf = (title: string) => slip().locator('li').filter({ hasText: title });

test('C3 Home: the strip is the first thing in the planner column, starts expanded, and counts the real total with the real today (not ?d=)', async () => {
	const today = await klToday();
	const yesterday = addDays(today, -1);
	const plannerDay = addDays(today, 9);
	await make({ title: `${PREFIX}C3 old`, date: yesterday, time: '08:00' });
	// if the strip used the planner's ?d= day, this future row would slip; with the real today it must not
	await make({ title: `${PREFIX}C3 future`, date: plannerDay });

	await page.goto(`/?d=${plannerDay}`);
	const aside = page.locator('aside.right');
	await expect(aside).toBeVisible();
	await expect(aside.locator('> *').first()).toHaveAttribute('aria-label', 'Slipped');
	const s = slip();
	await expect(s).toBeVisible();
	const toggle = s.locator('.toggle');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(toggle).toContainText('Slipped · 1'); // N = total, this fixture has one
	await expect(s.getByRole('button', { name: `${PREFIX}C3 old`, exact: true })).toBeVisible();
	await expect(s.getByRole('button', { name: `${PREFIX}C3 future`, exact: true })).toHaveCount(0); // prettier-ignore
	// above DayPlanner in the same column
	const above = await s.evaluate((n) => {
		const planner = document.querySelector('aside.right .planner');
		return !!planner && n.getBoundingClientRect().bottom <= planner.getBoundingClientRect().top + 1;
	});
	expect(above).toBe(true);
});

test('C4 row: title, full pretty original date, tap opens ItemView, ⋯ is the shared ActionSheet with the card 03 list and applies to the row', async () => {
	const today = await klToday();
	const date = addDays(today, -3);
	const title = `${PREFIX}C4 row`;
	const it = await make({ title, date, time: '10:00' });
	await page.goto('/');
	const row = rowOf(title);
	await expect(row).toBeVisible();
	await expect(row.locator('.title')).toHaveText(title);
	await expect(row.locator('.date')).toHaveText(pretty(date)); // "Mon 18 Nov 2026", the full prettyDate

	await row.getByRole('button', { name: title, exact: true }).click();
	const view = page.getByRole('dialog', { name: 'Item' });
	await expect(view).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/item/${it.id}$`));
	await page.goBack();
	await expect(view).toBeHidden();
	await expect(page).toHaveURL(/\/$/);

	await rowOf(title)
		.getByRole('button', { name: `Actions for ${title}` })
		.click();
	const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
	await expect(sheet).toBeVisible();
	// the shared ActionSheet (a BottomSheet dialog), card 03's list, and no Skip on a one-off
	await expect(sheet.getByRole('button').filter({ hasText: /.+/ })).toHaveText([
		'Today',
		'Tomorrow',
		'Next weekday',
		'+1 week',
		'Pick date…',
	]);
	await expect(sheet.getByRole('button', { name: 'Skip this one' })).toHaveCount(0);

	const tomorrow = addDays(today, 1);
	await sheet.getByRole('button', { name: 'Tomorrow', exact: true }).click();
	await expect(page.locator('.toast')).toContainText(`Moved "${title}" to ${pretty(tomorrow)}`);
	await expect.poll(async () => (await getItem(it.id)).date).toBe(tomorrow);
});

test('C5 Move all to today: one request to one endpoint, every matching row (52, though 50 show) in one batch, time and span kept, one Undo restores every date', async () => {
	const today = await klToday();
	const soon = addDays(today, -2);
	const spanFrom = addDays(today, -5);
	const spanTo = addDays(today, -3);
	const timed = await make({ title: `${PREFIX}C5 timed`, date: soon, time: '09:15' });
	const span = await make({ title: `${PREFIX}C5 span`, date: spanFrom, endDate: spanTo });
	const bulk: Item[] = [];
	for (let i = 0; i < 50; i++)
		bulk.push(await make({ title: `${PREFIX}C5 bulk ${i}`, date: addDays(today, -(10 + i)) }));

	await page.goto('/');
	await expect(slip().locator('.toggle')).toContainText('Slipped · 52');
	await expect(slip().locator('ul > li')).toHaveCount(50); // only 50 rows are shown

	const seen: string[] = [];
	const onReq = (r: import('@playwright/test').Request) => {
		if (r.url().includes('/api/items/') || r.url().includes('/api/undo'))
			seen.push(`${r.method()} ${new URL(r.url()).pathname}`);
	};
	page.on('request', onReq);
	await slip().getByRole('button', { name: 'Move all to today' }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Moved 52 slipped items to today');
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	await expect.poll(async () => (await getItem(timed.id)).date).toBe(today);
	expect((await getItem(timed.id)).time).toBe('09:15');
	expect((await getItem(span.id)).endDate).toBe(addDays(today, 2));
	for (const b of bulk) expect((await getItem(b.id)).date).toBe(today);

	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await getItem(timed.id)).date).toBe(soon);
	page.off('request', onReq);
	expect(seen.filter((r) => r === 'POST /api/items/move-all')).toHaveLength(1); // one endpoint, one call
	expect(seen.filter((r) => r.startsWith('PATCH /api/items/'))).toHaveLength(0); // never one PATCH per row
	expect(seen.filter((r) => r === 'POST /api/undo')).toHaveLength(1); // one undo batch
	expect((await getItem(span.id)).endDate).toBe(spanTo);
	expect((await getItem(timed.id)).time).toBe('09:15');
	await expect(slip().locator('.toggle')).toContainText('Slipped · 52');
});

test('C6 empty: no slipped rows = no strip at all (no header, no "nothing slipped" line)', async () => {
	await page.goto('/');
	await expect(page.locator('aside.right .planner')).toBeVisible(); // the page loaded
	await expect(slip()).toHaveCount(0);
	await expect(page.getByText(/Slipped/)).toHaveCount(0);
	await expect(page.getByText(/nothing slipped/i)).toHaveCount(0);
});

test('C8 collapse on desktop: starts expanded, the header keeps the count, toggling hides the rows without a reload or a data change', async () => {
	const today = await klToday();
	const yesterday = addDays(today, -1);
	const title = `${PREFIX}C8 row`;
	const it = await make({ title, date: yesterday });
	await page.goto('/');
	const toggle = slip().locator('.toggle');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true'); // expanded on desktop
	await expect(rowOf(title)).toBeVisible();
	const url = page.url();
	await page.evaluate(() => ((window as unknown as { __ltNoReload?: number }).__ltNoReload = 1));

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(rowOf(title)).toHaveCount(0);
	await expect(slip().locator('.toggle')).toContainText('Slipped · 1'); // header with the count remains
	// no reload, no navigation, no data change
	expect(page.url()).toBe(url);
	expect(await page.evaluate(() => (window as unknown as { __ltNoReload?: number }).__ltNoReload)).toBe(1); // prettier-ignore
	expect((await getItem(it.id)).date).toBe(yesterday);

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(rowOf(title)).toBeVisible();
});

test('C10 states: the strip is server-rendered (no skeleton), and a refused bulk move shows the server message with every date unchanged', async () => {
	const today = await klToday();
	const date = addDays(today, -2);
	const title = `${PREFIX}C10 row`;
	const it = await make({ title, date });

	// the shortcut response carries the strip already: nothing to load, so nothing can spin
	const html = await (await page.request.get('/')).text();
	expect(html).toContain('Slipped · 1');
	expect(html).toContain(title);
	expect(html).not.toContain('skeleton');

	await page.goto('/');
	await page.route('**/api/items/move-all', (route) =>
		route.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'bad_request', message: 'Blind bulk move failed.' } }),
		}),
	);
	try {
		await slip().getByRole('button', { name: 'Move all to today' }).click();
		const toast = page.locator('.toast');
		await expect(toast).toHaveAttribute('role', 'alert');
		await expect(toast).toContainText('Blind bulk move failed.');
		expect((await getItem(it.id)).date).toBe(date); // every date unchanged
	} finally {
		await page.unroute('**/api/items/move-all');
	}
});

test('C11 permission: a partner item never appears in my strip and my bulk move only writes my rows', async ({
	browser,
}) => {
	const today = await klToday();
	const mineTitle = `${PREFIX}C11 mine`;
	const theirsTitle = `${PREFIX}C11 theirs`;
	const mine = await make({ title: mineTitle, date: addDays(today, -1) });

	// invite a second account (no users API): invite code + signup
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	await expect(page.locator('[role="status"] code').first()).toBeVisible();
	const code = (await page.locator('[role="status"] code').first().innerText()).trim();
	expect(code).toMatch(/^INV-/);

	const ctx = await browser.newContext();
	try {
		const n = await ctx.newPage();
		await n.goto('/signup');
		await n.fill('#code', code);
		await n.fill('#nu', 'blind04partner');
		await n.fill('#dn', 'Blind 04 Partner');
		await n.fill('#np', 'blind partner phrase');
		await n.fill('#cp', 'blind partner phrase');
		await n.getByRole('button', { name: 'Create account' }).click();
		await n.waitForURL((u) => u.pathname === '/');
		const skip = n.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();

		const theirs = await api(n, 'POST', '/api/items', { title: theirsTitle, date: addDays(today, -1) }); // prettier-ignore
		expect(theirs.status, JSON.stringify(theirs.json)).toBe(201);
		const theirId = (theirs.json as { item: Item }).item.id;

		// the partner's own strip: their row, never mine
		await n.goto('/');
		const pSlip = n.locator('section[aria-label="Slipped"]');
		await expect(pSlip.getByRole('button', { name: theirsTitle, exact: true })).toBeVisible();
		await expect(pSlip.getByRole('button', { name: mineTitle, exact: true })).toHaveCount(0);

		// the partner's bulk move writes only their rows
		await pSlip.getByRole('button', { name: 'Move all to today' }).click();
		await expect(n.locator('.toast')).toContainText('Moved 1 slipped item to today');
		const theirAfter = await api(n, 'GET', `/api/items/${theirId}`);
		expect((theirAfter.json as { item: Item }).item.date).toBe(today);
		expect((await getItem(mine.id)).date).toBe(addDays(today, -1));

		// my strip: mine, never theirs, no row actions for theirs
		await page.goto('/');
		await expect(slip().getByRole('button', { name: mineTitle, exact: true })).toBeVisible();
		await expect(slip().getByRole('button', { name: theirsTitle, exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: `Actions for ${theirsTitle}` })).toHaveCount(0); // prettier-ignore
		await expect(page.getByRole('button', { name: `Actions for ${mineTitle}` })).toBeVisible();

		await api(n, 'DELETE', `/api/items/${theirId}`);
	} finally {
		await ctx.close();
	}
});

test('C12 more than 50: 50 rows, "N more" as a count label with the real remainder, and the header total matches', async () => {
	const today = await klToday();
	for (let i = 0; i < 52; i++)
		await make({ title: `${PREFIX}C12 ${String(i + 1).padStart(2, '0')}`, date: addDays(today, -(i + 1)) }); // prettier-ignore

	await page.goto('/');
	await expect(slip().locator('.toggle')).toContainText('Slipped · 52');
	await expect(slip().locator('ul > li')).toHaveCount(50);
	const rest = slip().locator('.rest');
	await expect(rest).toHaveText('2 more');
	expect(await rest.evaluate((n) => n.tagName)).toBe('P'); // a count label, not a button
	await expect(page.getByRole('button', { name: '2 more' })).toHaveCount(0);
	// the two oldest rows are the ones left out
	await expect(slip().getByRole('button', { name: `${PREFIX}C12 51`, exact: true })).toHaveCount(0); // prettier-ignore
	await expect(slip().getByRole('button', { name: `${PREFIX}C12 52`, exact: true })).toHaveCount(0); // prettier-ignore
	await expect(slip().getByRole('button', { name: `${PREFIX}C12 50`, exact: true })).toBeVisible();
});

test('C13 offline: Move all shows the usual offline toast, changes nothing and is not queued', async () => {
	const today = await klToday();
	const date = addDays(today, -2);
	const title = `${PREFIX}C13 row`;
	const it = await make({ title, date });
	await page.goto('/');
	await page.context().setOffline(true);
	try {
		await slip().getByRole('button', { name: 'Move all to today' }).click();
		const toast = page.locator('.toast');
		await expect(toast).toHaveAttribute('role', 'alert');
		await expect(toast).toContainText("You're offline. Not saved.");
		const queue = await page.evaluate(() => localStorage.getItem('lt_action_queue') ?? '');
		expect(queue).not.toContain('move-all');
	} finally {
		await page.context().setOffline(false);
	}
	expect((await getItem(it.id)).date).toBe(date); // nothing changed
});
