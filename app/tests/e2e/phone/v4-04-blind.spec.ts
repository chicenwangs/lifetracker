// Blind tests for card 04 on the phone projects, from its Done-when lines only: C7, C8 and C9.
// C7 is the phone strip; C8 the landscape collapse on Home and /today; C9 the toast lift over an open
// BottomSheet (O-10). No builder test was opened.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { HINTS, expectTargets48, noDesktopHints, setHints, swipe } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1';
const PREFIX = 'Blind04P ';
const LIST5 = ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…'];

let page: Page;
let P = '';
const created: string[] = [];

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		// a desktop reset must not block this file
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

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	P = info.project.name;
	await signIn(page);
});
test.afterAll(() => page.context().close());

interface Item {
	id: string;
	title: string;
	date: string | null;
	time: string | null;
	status: string;
}
async function make(fields: Record<string, unknown>): Promise<Item> {
	const r = await page.evaluate(async (b) => {
		const res = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(b),
		});
		return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
	}, fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: Item }).item;
	created.push(item.id);
	return item;
}
async function get(id: string) {
	return page.evaluate(async (i) => {
		const res = await fetch(`/api/items/${encodeURIComponent(i)}`);
		return {
			status: res.status,
			item: res.ok ? ((await res.json()) as { item: Item }).item : undefined,
		};
	}, id);
}
async function calendarItems(from: string, to: string): Promise<Item[]> {
	const r = await page.evaluate(
		async ([f, t]) => {
			const res = await fetch(`/api/calendar?from=${f}&to=${t}`);
			return ((await res.json()) as { items: Item[] }).items;
		},
		[from, to] as const,
	);
	return r;
}
const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const addDays = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** the app's prettyDate: "Mon 30 Nov 2026" (the day is not zero-padded) */
function pretty(date: string) {
	const t = new Date(`${date}T00:00:00Z`);
	const wd = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
	return `${WD[wd - 1]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; // prettier-ignore
}
/** the row button's accessible name: the visible title + date (#298) */
const rowName = (title: string, date: string) => `${title}, ${pretty(date)}`;

async function sweep() {
	const today = await klToday();
	const rows = await calendarItems(addDays(today, -60), addDays(today, 1));
	for (const r of rows)
		if (r.title.startsWith(PREFIX))
			await page.evaluate(async (i) => {
				await fetch(`/api/items/${i}`, { method: 'DELETE' });
			}, r.id);
}
test.beforeEach(() => sweep());
test.afterEach(async () => {
	for (const id of created.splice(0))
		await page.evaluate(async (i) => {
			await fetch(`/api/items/${i}`, { method: 'DELETE' });
		}, id);
});

const slip = () => page.locator('section[aria-label="Slipped"]');
const rowOf = (title: string) => slip().locator('li').filter({ hasText: title });
/** rows already slipped before this test (a full phone run shares one DB) */
async function slipTotal() {
	const cap = slip().locator('.cap');
	return (await cap.count()) ? Number((await cap.first().innerText()).split('·')[1]?.trim()) : 0;
}
const movedToast = (n: number) => `Moved ${n} slipped item${n === 1 ? '' : 's'} to today`;
const taller48 = async (el: Locator) =>
	(await el.evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().height))).every((h) => h >= 48);

test('C7 phone: the strip sits at the top of /today, tap opens the item sheet, swipes tick and delete with Undo, ⋯ is the shared ActionSheet, 48 dp, Back closes first, no key hints', async () => {
	await page.goto('/today');
	const base = await slipTotal(); // rows already slipped before this test: assert the delta
	const today = await klToday();
	const title = `${PREFIX}C7 ${P}`;
	const it = await make({ title, date: addDays(today, -2), time: '08:00' });
	await page.goto('/today');
	const s = slip();
	await expect(s).toBeVisible();
	const first = page.locator('main.today > *').first();
	await expect(first).toHaveAttribute('aria-label', 'Slipped');
	const a = await s.boundingBox();
	const b = await page.locator('header.day').boundingBox();
	expect(a && b && a.y < b.y).toBe(true); // at the top of the day view
	await expect(s.locator('.toggle')).toContainText(`Slipped · ${base + 1}`);

	// landscape starts collapsed (C8): open the list so its rows and ⋯ are reachable
	const toggle = s.locator('.toggle');
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	const name = rowName(title, it.date!); // #298: the accessible name carries title + date
	const titleBtn = s.getByRole('button', { name, exact: true });
	await expect(titleBtn).toBeVisible();

	// tap = the item sheet
	await titleBtn.click();
	const itemSheet = page.getByRole('dialog', { name: 'Item' });
	await expect(itemSheet).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/item/${it.id}$`));
	await page.goBack();
	await expect(itemSheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');

	// ⋯ = the shared ActionSheet with the card 03 list, no Skip on a one-off, 48 dp, no key hints
	await rowOf(title)
		.getByRole('button', { name: `Actions for ${title}` })
		.click();
	const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
	await expect(sheet).toBeVisible();
	const acts = sheet.getByRole('button').filter({ hasText: /.+/ });
	await expect(acts).toHaveText(LIST5);
	await expect(sheet.getByRole('button', { name: 'Skip this one' })).toHaveCount(0);
	expect(await taller48(acts)).toBe(true);
	await expectTargets48(page);
	await noDesktopHints(page);
	await page.goBack(); // Back closes the sheet first
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');

	// swipe right = done, with Undo on the toast
	await swipe(page, rowOf(title), 'right');
	const toast = page.locator('.toast');
	await expect(toast).toContainText(`Done: "${title}"`);
	await expect.poll(async () => (await get(it.id)).item?.status).toBe('done');
	await expect(s.getByRole('button', { name, exact: true })).toHaveCount(0); // done rows leave the strip
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await get(it.id)).item?.status).toBe('todo');
	await expect(s.getByRole('button', { name, exact: true })).toBeVisible();

	// swipe left = delete, with Undo on the toast
	await swipe(page, rowOf(title), 'left');
	await expect(page.locator('.toast')).toContainText(`Deleted "${title}"`);
	await expect.poll(async () => (await get(it.id)).status).toBe(404);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await get(it.id)).status).toBe(200);
	await expect(s.getByRole('button', { name, exact: true })).toBeVisible();
});

test('C8 collapse on phone: landscape starts collapsed on Home and /today, portrait starts expanded, and toggling reloads nothing and changes no data', async () => {
	await page.goto('/today');
	const base = await slipTotal(); // rows already slipped before this test
	const today = await klToday();
	const title = `${PREFIX}C8 ${P}`;
	const it = await make({ title, date: addDays(today, -1) });
	const landscape = P === 'phone-landscape';
	const expanded = !landscape;

	const check = async (url: string) => {
		await page.goto(url);
		const s = slip();
		const toggle = s.locator('.toggle');
		await expect(toggle).toContainText(`Slipped · ${base + 1}`);
		await expect(s.locator('.chev')).toBeVisible(); // header with the count and chevron
		await expect(toggle).toHaveAttribute('aria-expanded', String(expanded));
		if (expanded) await expect(rowOf(title)).toBeVisible();
		else await expect(rowOf(title)).toHaveCount(0);

		const before = page.url();
		await page.evaluate(() => ((window as unknown as { __ltNoReload?: number }).__ltNoReload = 1));
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', String(!expanded));
		if (expanded) await expect(rowOf(title)).toHaveCount(0);
		else await expect(rowOf(title)).toBeVisible();
		expect(page.url()).toBe(before);
		expect(await page.evaluate(() => (window as unknown as { __ltNoReload?: number }).__ltNoReload)).toBe(1); // prettier-ignore
		expect((await get(it.id)).item?.date).toBe(addDays(today, -1));
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', String(expanded));
	};

	await check('/today');
	await check(`/?d=${today}`); // Home (the phone lands on /today unless ?d is present)
});

test('C9 toast vs sheet: 8 px above the sheet when there is room, clamped fully on screen in landscape, never over its button row', async () => {
	await page.goto('/today');
	const base = await slipTotal(); // rows already slipped before this test
	const today = await klToday();
	const title = `${PREFIX}C9 ${P}`;
	const it = await make({ title, date: addDays(today, -1) });
	await page.goto('/today');
	const s = slip();
	await expect(s).toBeVisible();
	// landscape starts collapsed: open the list so its ⋯ is reachable
	const toggle = s.locator('.toggle');
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();

	await s.getByRole('button', { name: `Actions for ${title}` }).click();
	const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
	await expect(sheet).toBeVisible();
	// a toast may arrive while the sheet is open (an in-app reminder is one); fire one from the page
	// behind the scrim so the global rule can be measured
	await page.getByRole('button', { name: 'Move all to today' }).evaluate((n) => (n as HTMLElement).click());
	const toast = page.locator('.toast');
	await expect(toast).toContainText(movedToast(base + 1));
	const geom = () =>
		page.evaluate(() => {
			const panel = document.querySelector('[role="dialog"][aria-label^="Actions for"]')!;
			const wrap = document.querySelector('.wrap')!;
			const t = document.querySelector('.toast')!;
			return {
				panelTop: panel.getBoundingClientRect().top,
				wrapBottom: wrap.getBoundingClientRect().bottom,
				toastTop: t.getBoundingClientRect().top,
				toastBottom: t.getBoundingClientRect().bottom,
				firstActTop: document.querySelector('[role="dialog"] .act')!.getBoundingClientRect().top, // prettier-ignore
				h: innerHeight,
			};
		});
	const landscape = P === 'phone-landscape';
	// O-10 / D-V4-17: 8 px above the sheet's top edge (the toast may still be rising for 240 ms). A 92 dvh
	// landscape sheet leaves ~33 px, so there the lift is clamped: the toast stays fully on screen instead.
	await expect
		.poll(async () => {
			const g = await geom();
			if (g.toastTop < 0 || g.toastBottom > g.h) return 'off-screen';
			return landscape ? 'on-screen' : Math.abs(g.panelTop - g.wrapBottom - 8) <= 1 ? 'on-screen' : 'gap';
		})
		.toBe('on-screen');
	// and therefore never over the sheet's button row
	await expect
		.poll(async () => {
			const g = await geom();
			return g.toastBottom - g.firstActTop;
		})
		.toBeLessThanOrEqual(0);
	// the card names the stacking too: toast layer 100 above the sheet layer (80 on phone)
	const z = await page.evaluate(() => ({
		wrap: Number(getComputedStyle(document.querySelector('.wrap')!).zIndex),
		sheet: Number(getComputedStyle(document.querySelector('.scrim')!).zIndex),
	}));
	expect(z.wrap).toBe(100);
	expect(z.wrap).toBeGreaterThan(z.sheet);

	// the toast's own action still works while the sheet is open, and it undoes the move
	await toast.getByRole('button', { name: 'Undo' }).evaluate((n) => (n as HTMLElement).click());
	await expect.poll(async () => (await get(it.id)).item?.date).toBe(addDays(today, -1));
});
