// Blind tests for card 06 "print week", from its Done-when lines only (desktop project): C1–C8.
// The builder's tests were not opened. Card: sprint/v4/cards/06-print-week.md.
import { expect, test, type Browser, type Page, type Request } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind06';
const A4 = { width: 1123, height: 794 };

type PrintWindow = Window & { printCalls?: number };

let page: Page;
const madeItems: string[] = [];
const madeBlocks: string[] = [];

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

interface ApiReply {
	status: number;
	json: unknown;
}
async function api(method: string, path: string, body?: unknown): Promise<ApiReply> {
	return page.evaluate(
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

async function makeItem(fields: Record<string, unknown>): Promise<string> {
	const r = await api('POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const id = (r.json as { item: { id: string } }).item.id;
	madeItems.push(id);
	return id;
}
async function makeBlock(fields: Record<string, unknown>): Promise<string> {
	const r = await api('POST', '/api/blocks', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const id = (r.json as { block: { id: string } }).block.id;
	madeBlocks.push(id);
	return id;
}
async function cleanUp() {
	for (const id of madeBlocks.splice(0)) await api('DELETE', `/api/blocks/${id}`).catch(() => {});
	for (const id of madeItems.splice(0)) await api('DELETE', `/api/items/${id}`).catch(() => {});
}

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const weekPath = (date: string) => `/week?w=${date}`;
/** KL is UTC+8 and has no DST: a local wall time to the UTC instant the API stores */
const utcAt = (date: string, time: string) =>
	new Date(`${date}T${time}:00+08:00`).toISOString().replace(/\.\d{3}Z$/, 'Z');

function undoCount(): number {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR not set');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return (db.prepare('select count(*) as n from undo_actions').get() as { n: number }).n;
	} finally {
		db.close();
	}
}

async function ensureLight() {
	const toLight = page.getByRole('button', { name: 'Switch to light mode' });
	if (await toLight.isVisible().catch(() => false)) await toLight.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}
async function ensureDark() {
	const toDark = page.getByRole('button', { name: 'Switch to dark mode' });
	if (await toDark.isVisible().catch(() => false)) await toDark.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

/** a partner calendar shared with me, so the week's Overlap switch really renders (C3) */
async function createShare(browser: Browser) {
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	await expect(page.locator('[role="status"] code').first()).toBeVisible();
	const invite = (await page.locator('[role="status"] code').first().innerText()).trim();
	expect(invite).toMatch(/^INV-/);

	const ctx = await browser.newContext();
	try {
		const partner = await ctx.newPage();
		await partner.goto('/signup');
		await partner.fill('#code', invite);
		await partner.fill('#nu', 'blind06partner');
		await partner.fill('#dn', 'Blind06 Partner');
		await partner.fill('#np', 'blind partner phrase');
		await partner.fill('#cp', 'blind partner phrase');
		await partner.getByRole('button', { name: 'Create account' }).click();
		await partner.waitForURL((u) => u.pathname === '/');
		const skip = partner.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();

		// swap share codes: she makes one, I add her calendar
		await partner.goto('/settings/sharing');
		await partner.getByRole('button', { name: 'Make a code' }).click();
		const code = (await partner.getByLabel('Your share code').textContent())!.trim();
		expect(code).toMatch(/^LT-/);
		await page.goto('/settings/sharing');
		await page.getByLabel('Code from the other person').fill(code);
		await page.getByRole('button', { name: 'Add calendar' }).click();
		await expect(page.getByText(/You can now see Blind06 Partner's calendar/)).toBeVisible();
	} finally {
		await ctx.close();
	}
}

/** the print overrides on one event: white bg, #000 text, only a 3 px type-coloured left border */
async function eventPaint(selector: string, text: string) {
	const ev = page.locator(selector, { hasText: text });
	await expect(ev).toBeVisible();
	return ev.evaluate((el) => {
		const s = getComputedStyle(el);
		const main = el.querySelector('.fc-event-main');
		const title = el.querySelector('.lt-title');
		return {
			bg: s.backgroundColor,
			leftWidth: s.borderLeftWidth,
			leftColor: s.borderLeftColor,
			top: s.borderTopColor,
			right: s.borderRightColor,
			bottom: s.borderBottomColor,
			main: main ? getComputedStyle(main).color : null,
			title: title ? getComputedStyle(title).color : null,
		};
	});
}
const WHITE_SHEET = {
	bg: 'rgb(255, 255, 255)',
	leftWidth: '3px',
	leftColor: 'rgb(206, 211, 238)', // --work-line (#ced3ee), the same in light and dark
	top: 'rgba(0, 0, 0, 0)',
	right: 'rgba(0, 0, 0, 0)',
	bottom: 'rgba(0, 0, 0, 0)',
	main: 'rgb(0, 0, 0)',
	title: 'rgb(0, 0, 0)',
};

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test.beforeEach(async () => {
	await page.emulateMedia({ media: 'screen' });
	await page.setViewportSize({ width: 1440, height: 900 });
	await ensureLight();
});
test.afterEach(async () => {
	await page.emulateMedia({ media: 'screen' });
	await page.setViewportSize({ width: 1440, height: 900 });
	await cleanUp();
});

test('C1 the desktop week bar ⋯ has exactly one item, Print week, and choosing it calls window.print()', async () => {
	const today = await klToday();
	await makeItem({ title: `${PREFIX} C1 chip`, date: today, type: 'Work' });
	await page.goto(weekPath(today));

	const trigger = page.getByRole('button', { name: 'Week menu' });
	await expect(trigger).toBeVisible();
	await expect(trigger).toHaveText('⋯');
	await trigger.click();

	const menu = page.getByRole('menu');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('menuitem')).toHaveCount(1);
	await expect(menu.getByRole('menuitem')).toHaveText('Print week');

	await page.evaluate(() => {
		(window as PrintWindow).printCalls = 0;
		window.print = () => {
			(window as PrintWindow).printCalls = ((window as PrintWindow).printCalls ?? 0) + 1;
		};
	});
	await menu.getByRole('menuitem', { name: 'Print week' }).click();
	await expect.poll(() => page.evaluate(() => (window as PrintWindow).printCalls)).toBe(1);
	await expect(menu).toHaveCount(0);
});

test('C2 no ⋯ or Print week entry at phone width, and the on-screen week is unchanged', async () => {
	await page.setViewportSize({ width: 412, height: 915 });
	const today = await klToday();
	await page.goto(weekPath(today));

	const phone = page.locator('main.phone');
	await expect(phone).toBeVisible();
	await expect(page.locator('main.wrap')).toBeHidden();

	// the entry is not rendered in the phone bar, nor visible anywhere else
	await expect(phone.locator('[aria-label="Week menu"]')).toHaveCount(0);
	await expect(phone.getByRole('button', { name: 'Week menu' })).toHaveCount(0);
	await expect(phone.getByText('Print week')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Week menu' })).toHaveCount(0);

	// unchanged: the phone bar's date range and the swipeable week are there
	await expect(phone.locator('.pbar strong')).toContainText(/\d/);
	await expect(phone.getByRole('group', { name: /The week/ })).toBeVisible();
});

test('C3 print hides the header, bottom bar, toolbar, Overlap toggle, TypeBar, rail and hints; the date-range title stays', async ({
	browser,
}) => {
	const today = await klToday();
	await page.goto(weekPath(today));

	// OverlapToggle only renders when a calendar is shared with me (flow.spec may leave one)
	const ov = page.locator('main.wrap .bar .ov');
	if ((await ov.count()) === 0) {
		await createShare(browser);
		await page.goto(weekPath(today));
	}
	await expect(ov).toBeVisible();
	await expect(ov).toHaveAttribute('role', 'switch');

	const title = (await page.locator('main.wrap h1').innerText()).trim();
	expect(title.length).toBeGreaterThan(0);

	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('header.hdr')).toBeHidden();
	await expect(page.locator('nav.mbar')).toBeHidden();
	await expect(page.locator('main.wrap .bar [aria-label="Previous week"]')).toBeHidden();
	await expect(page.locator('main.wrap .bar [aria-label="Next week"]')).toBeHidden();
	await expect(page.locator('main.wrap .bar button', { hasText: 'Today' })).toBeHidden();
	await expect(ov).toBeHidden();
	await expect(page.locator('main.wrap .bar .view')).toBeHidden();
	await expect(page.locator('main.wrap .types')).toBeHidden();
	await expect(page.locator('main.wrap aside.side')).toBeHidden();
	await expect(page.locator('main.wrap .foot')).toBeHidden();
	await expect(page.locator('main.phone [role="note"]')).toBeHidden();

	// no toolbar control is left visible at all
	const visibleControls = await page
		.locator('main.wrap .bar.strip button, main.wrap .bar.strip a')
		.evaluateAll(
			(els) =>
				els.filter((e) => {
					const r = e.getBoundingClientRect();
					return r.width > 1 && r.height > 1;
				}).length,
		);
	expect(visibleControls).toBe(0);

	const h1 = page.locator('main.wrap h1');
	await expect(h1).toBeVisible();
	await expect(h1).toHaveText(title);
});

test('C4 at 1123×794 print: 7 day columns, all-day row, time grid with the item and block, no overflow', async () => {
	await page.setViewportSize(A4);
	const today = await klToday();
	await makeItem({ title: `${PREFIX} C4 chip`, date: today, type: 'Work' });
	await makeBlock({
		label: `${PREFIX} C4 block`,
		startAt: utcAt(today, '10:00'),
		endAt: utcAt(today, '11:00'),
		type: 'Work',
	});
	await page.goto(weekPath(today));
	await page.emulateMedia({ media: 'print' });

	await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);
	await expect(page.locator('.wk .fc-timegrid-col:not(.fc-timegrid-axis)')).toHaveCount(7);
	await expect(page.locator('.wk .fc-timegrid .fc-daygrid-body').first()).toBeVisible();
	await expect(page.locator('.wk .fc-timegrid-slots')).toBeVisible();
	await expect(page.locator('.wk .fc-daygrid-event', { hasText: `${PREFIX} C4 chip` })).toBeVisible();
	await expect(page.locator('.wk .fc-timegrid-event', { hasText: `${PREFIX} C4 block` })).toBeVisible();

	const scroll = await page.evaluate(() =>
		Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
	);
	expect(scroll).toBeLessThanOrEqual(A4.width);
});

test('C5 print is black on white with the type colour only as a 3 px left border, light and dark', async () => {
	await page.setViewportSize(A4);
	const today = await klToday();
	await makeItem({ title: `${PREFIX} C5 chip`, date: today, type: 'Work' });
	await makeBlock({
		label: `${PREFIX} C5 block`,
		startAt: utcAt(today, '10:00'),
		endAt: utcAt(today, '11:00'),
		type: 'Work',
	});
	await page.goto(weekPath(today));
	await page.emulateMedia({ media: 'print' });

	expect(await eventPaint('.fc-daygrid-event', `${PREFIX} C5 chip`)).toEqual(WHITE_SHEET);
	expect(await eventPaint('.fc-timegrid-event', `${PREFIX} C5 block`)).toEqual(WHITE_SHEET);
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 0)');

	// a dark on-screen session prints the same black-on-white sheet
	await page.emulateMedia({ media: 'screen' });
	await ensureDark();
	await page.emulateMedia({ media: 'print' });
	expect(await eventPaint('.fc-daygrid-event', `${PREFIX} C5 chip`)).toEqual(WHITE_SHEET);
	expect(await eventPaint('.fc-timegrid-event', `${PREFIX} C5 block`)).toEqual(WHITE_SHEET);
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 0)');
});

test('C6 @page is A4 landscape and a phone-width print still forces the 7-column grid', async () => {
	const today = await klToday();
	await page.goto(weekPath(today));
	const pageRules = await page.evaluate(() => {
		const out: string[] = [];
		for (const sheet of Array.from(document.styleSheets)) {
			let rules: CSSRuleList;
			try {
				rules = sheet.cssRules;
			} catch {
				continue;
			}
			for (const r of Array.from(rules)) if (r.type === CSSRule.PAGE_RULE) out.push(r.cssText);
		}
		return out;
	});
	expect(pageRules.some((r) => /@page/i.test(r) && /A4\s+landscape/i.test(r))).toBe(true);

	// loaded at phone width on screen, then printed: never a blank page
	await page.setViewportSize({ width: 412, height: 915 });
	await page.goto(weekPath(today));
	await expect(page.locator('main.phone')).toBeVisible();
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('main.phone')).toBeHidden();
	await expect(page.locator('main.wrap')).toBeVisible();
	await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);
	await expect(page.locator('.wk .fc-col-header-cell').first()).toBeVisible();
	await expect(page.locator('.wk .fc-timegrid-col:not(.fc-timegrid-axis)')).toHaveCount(7);
	await expect(page.locator('main.wrap h1')).toBeVisible();
});

test('C7 outside print nothing changes: no mutation or undo entry, desktop and phone, light and dark', async () => {
	const today = await klToday();
	await page.goto(weekPath(today));
	await expect(page.locator('header.hdr')).toBeVisible();
	await expect(page.locator('main.wrap .bar.strip')).toBeVisible();
	await expect(page.locator('main.wrap .types')).toBeVisible();
	await expect(page.locator('main.wrap aside.side')).toBeVisible();
	await expect(page.locator('main.wrap .foot')).toBeVisible();

	// the only on-screen addition: the desktop ⋯ with its one item
	const trigger = page.getByRole('button', { name: 'Week menu' });
	await expect(trigger).toBeVisible();
	await page.evaluate(() => {
		window.print = () => {};
	});

	// opening it and printing writes nothing and creates no undo entry
	const before = undoCount();
	const writes: string[] = [];
	const onRequest = (r: Request) => {
		if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`);
	};
	page.on('request', onRequest);
	await trigger.click();
	await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(1);
	await page.getByRole('menuitem', { name: 'Print week' }).click();
	await page.waitForTimeout(500); // a fire-and-forget request would show up by now
	page.off('request', onRequest);
	expect(writes).toEqual([]);
	expect(undoCount()).toBe(before);
	await expect(page.locator('.toast')).toHaveCount(0);

	// phone width keeps today's layout: phone agenda, no ⋯
	await page.setViewportSize({ width: 412, height: 915 });
	await expect(page.locator('main.phone')).toBeVisible();
	await expect(page.locator('main.wrap')).toBeHidden();
	await expect(page.getByRole('button', { name: 'Week menu' })).toHaveCount(0);
	await expect(page.locator('header.hdr')).toBeVisible();

	// dark outside print keeps the normal shell and dark card
	await page.setViewportSize({ width: 1440, height: 900 });
	await ensureDark();
	await expect(page.locator('header.hdr')).toBeVisible();
	await expect(page.locator('main.wrap aside.side')).toBeVisible();
	await expect(page.locator('main.wrap .wkc')).toHaveCSS('background-color', 'rgb(23, 22, 58)');
});

test('C8 an empty week prints as an empty grid; print has no loading/empty/error state of its own', async () => {
	await page.setViewportSize(A4);
	await page.goto(weekPath('2035-03-05'));
	await page.emulateMedia({ media: 'print' });

	await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);
	await expect(page.locator('.wk .fc-timegrid .fc-daygrid-body').first()).toBeVisible();
	await expect(page.locator('.wk .fc-timegrid-slots')).toBeVisible();
	await expect(page.locator('.wk .fc-event')).toHaveCount(0);
	await expect(page.locator('main.wrap h1')).toBeVisible();
	await expect(page.locator('main.wrap h1')).toContainText('2035');
	await expect(page.locator('.alert')).toHaveCount(0);
});
