// Blind tests for card 10 (per-type `Month calendar` flag) on the phone projects, from its Done-when lines
// only: C9 (types table columns, no sideways scroll, 48 dp switch, no desktop copy, Back, type absent from
// Month), C4 (phone Month: my item dots/agenda go, block dots stay), C7 (a day with only a hidden item looks
// empty). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import { HINTS, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file
const PREFIX = 'Blind10p ';
const HELPER = 'Off = hidden on Month, still on Week, Today and reminders.';

let page: Page;
const items: string[] = [];
const blocks: string[] = [];

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
	await setHints(p, HINTS);
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
}
interface TypeDTO {
	id: string;
	key: string;
	name: string;
	onCalendar: boolean;
}
const listTypes = async (): Promise<TypeDTO[]> =>
	((await api(page, 'GET', '/api/item-types')).json as { types: TypeDTO[] }).types;
const workType = async (): Promise<TypeDTO> => (await listTypes()).find((t) => t.key === 'Work')!;
async function setWork(on: boolean) {
	const r = await api(page, 'PATCH', `/api/item-types/${(await workType()).id}`, { onCalendar: on });
	expect(r.status, JSON.stringify(r.json)).toBe(200);
}
async function makeItem(fields: Record<string, unknown>): Promise<Item> {
	const r = await api(page, 'POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: Item }).item;
	items.push(item.id);
	return item;
}
/** 10:00-11:00 Kuala Lumpur on a day, as UTC */
async function makeBlock(label: string, day: string): Promise<void> {
	const [startAt, endAt] = await page.evaluate(
		([d]) =>
			[
				new Date(`${d}T10:00:00+08:00`).toISOString().replace(/\.\d{3}Z$/, 'Z'),
				new Date(`${d}T11:00:00+08:00`).toISOString().replace(/\.\d{3}Z$/, 'Z'),
			] as const,
		[day] as const,
	);
	const r = await api(page, 'POST', '/api/blocks', { label, type: 'Work', startAt, endAt });
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	blocks.push((r.json as { block: { id: string } }).block.id);
}

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const cellOf = (day: string) => page.locator(`a.cell[href*="d=${day}"]`);
const agenda = () => page.locator('section[aria-label^="Agenda for"]');
const sw = () => page.getByRole('switch', { name: 'Month calendar for Work' });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	page = await ctx.newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test.afterEach(async () => {
	for (const id of items.splice(0)) await api(page, 'DELETE', `/api/items/${id}`); // prettier-ignore
	for (const id of blocks.splice(0)) await api(page, 'DELETE', `/api/blocks/${id}`); // prettier-ignore
	await setWork(true); // a failure in one test must not cascade into the next
});

// ---- C9 ---------------------------------------------------------------------------------------------------
test('C9 phone types table keeps Colour/Name/Quick add/Month calendar at 48 dp with no sideways scroll, drops Order/Used, and Back returns', async () => {
	const today = await klToday();
	const title = PREFIX + `C9 ${Date.now().toString(36)}`;
	await makeItem({ title, type: 'Work', date: today });

	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Planner' })).toBeVisible();
	const planner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Planner' }) });
	await planner.getByRole('link', { name: /^Item types/ }).click();
	await expect(page).toHaveURL(/\/settings\/types$/);
	await expect(page.getByRole('banner')).toContainText('Item types');

	// D-V4-28: Order and Used are gone; Colour, Name, Quick add and Month calendar stay
	await expect(page.locator('th.ord')).toBeHidden();
	await expect(page.locator('th.used')).toBeHidden();
	for (const h of ['Colour', 'Name', 'Quick add', 'Month calendar']) {
		await expect(page.getByRole('columnheader', { name: h }), h).toBeVisible();
	}
	await expect(page.getByText(HELPER, { exact: true })).toBeVisible();

	// no horizontal scrollbar: not the table, not its card, not the page
	const panel = page.locator('section.panel');
	for (const el of [panel, panel.locator('table')]) {
		const { sw: wide, cw } = await el.evaluate((n) => ({ sw: n.scrollWidth, cw: n.clientWidth }));
		expect(wide, await el.evaluate((n) => n.tagName)).toBeLessThanOrEqual(cw + 1);
	}
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
	).toBeLessThanOrEqual(1);

	// the switch label is the 48 dp hit area (D-V4-11), and no desktop key copy is shown or read out
	const label = page.locator('label.cb').filter({ has: sw() });
	const box = await label.boundingBox();
	expect(box).not.toBeNull();
	expect(Math.round(box!.width)).toBeGreaterThanOrEqual(48);
	expect(Math.round(box!.height)).toBeGreaterThanOrEqual(48);
	await noDesktopHints(page);

	// the phone switch works; on Month the type (and its item) is simply absent, never a disabled chip
	await expect(sw()).toBeChecked();
	await sw().uncheck();
	await expect(sw()).not.toBeChecked();

	await page.goto('/month');
	await expect(page.getByRole('navigation', { name: /^Days/ })).toBeVisible();
	await expect(page.getByText(title)).toHaveCount(0);
	await expect(page.locator('[aria-disabled="true"]').filter({ hasText: title })).toHaveCount(0);

	// Back returns to the Settings list
	await page.goto('/settings/types');
	await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('link', { name: /^Item types/ })).toBeVisible();
	await noDesktopHints(page);
});

// ---- C4 ---------------------------------------------------------------------------------------------------
test('C4 phone Month: my off-type item leaves the dots and agenda, a block of the same off type keeps its dot', async () => {
	const today = await klToday();
	const ym = today.slice(0, 7);
	const stamp = Date.now().toString(36);
	const title = PREFIX + `C4 item ${stamp}`;
	const label = PREFIX + `C4 block ${stamp}`;
	await makeItem({ title, type: 'Work', date: today, time: '14:00' });
	await makeBlock(label, today);

	await page.goto(`/month?m=${ym}&d=${today}`);
	const cell = cellOf(today);
	await expect(cell).toHaveAttribute('aria-label', /, 2 planned$/);
	await expect(cell.locator('.dots i')).toHaveCount(2);
	await expect(agenda().getByText(title, { exact: true })).toBeVisible();
	await expect(agenda().getByText(label, { exact: true })).toBeVisible();

	await setWork(false);
	await page.goto(`/month?m=${ym}&d=${today}`);
	await expect(cell).toHaveAttribute('aria-label', /, 1 planned$/); // the block only
	await expect(cell.locator('.dots i')).toHaveCount(1);
	await expect(cell.locator('.dots b')).toHaveCount(0);
	await expect(agenda().getByText(label, { exact: true })).toBeVisible();
	await expect(agenda().getByText(title, { exact: true })).toHaveCount(0);
	await expect(page.getByText(title)).toHaveCount(0); // absent, no disabled chip
});

// ---- C7 ---------------------------------------------------------------------------------------------------
test('C7 phone Month: a day whose only item is hidden looks empty, with no "+N hidden" marker', async () => {
	const month = (await klToday()).slice(0, 7);
	const day = `${month}-12`;
	const control = `${month}-13`;
	const stamp = Date.now().toString(36);
	const title = PREFIX + `C7 ${stamp}`;
	const other = PREFIX + `C7 control ${stamp}`;
	await makeItem({ title, type: 'Work', date: day });
	await makeItem({ title: other, type: 'Event', date: control }); // gate: the grid really rendered
	await setWork(false);

	await page.goto(`/month?m=${month}&d=${day}`);
	await expect(cellOf(control)).toHaveAttribute('aria-label', /, 1 planned$/);
	await expect(cellOf(day)).toHaveAttribute('aria-label', /, 0 planned$/);
	await expect(cellOf(day).locator('.dots i')).toHaveCount(0);
	await expect(cellOf(day).locator('.dots b')).toHaveCount(0);
	await expect(agenda()).toContainText('Nothing planned.');
	expect(await page.locator('main').innerText()).not.toMatch(/\d+ hidden|hidden on month/i);
});
