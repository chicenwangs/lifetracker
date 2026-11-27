// Card 06 C1–C8: print week. The desktop ⋯ calls window.print(), phone has no entry, and print media
// hides the shell, keeps the week title, forces 7 columns on one A4 landscape sheet (black on white,
// the type colour only as a 3 px left border) at 1123×794 in light and dark.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of PASSWORDS) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForURL((u) => !/^\/(login|setup)/.test(u.pathname), { timeout: 5000 }).catch(() => {});
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** JSON fetch as the page's user (same helper shape as flow.spec.ts) */
const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: await r.json().catch(() => null) };
		},
		[m, p, b] as const,
	);
const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return r.j.item.id as string;
};
const drop = (page: Page, kind: 'items' | 'blocks', id: string) => api(page, 'DELETE', `/api/${kind}/${id}`);
const plusDays = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
/** owner-local wall clock -> UTC string (blocks are UTC, e2e timezone = Asia/Kuala_Lumpur) */
const utc = (date: string, hm: string) => new Date(`${date}T${hm}:00+08:00`).toISOString().slice(0, 19) + 'Z';

/** a second account shares its calendar with jeremy, so the week bar renders OverlapToggle (its button is
    a child component: the print rule needs :global to hide it). flow.spec may already have left a share. */
async function ensureSharedCalendar(page: Page, browser: Browser) {
	await page.goto('/settings/sharing');
	if (await page.locator('section', { hasText: 'Calendars I can see' }).locator('.person').count()) return;
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	const invite = (await page.locator('[role="status"] code').first().innerText()).trim();
	const ctx = await browser.newContext();
	const other = await ctx.newPage();
	try {
		await other.goto('/signup');
		await other.fill('#code', invite);
		await other.fill('#nu', `print${Date.now().toString(36)}`);
		await other.fill('#dn', 'Print partner');
		await other.fill('#np', `${PW} print`);
		await other.fill('#cp', `${PW} print`);
		await other.getByRole('button', { name: 'Create account' }).click();
		await other.waitForURL((u) => u.pathname === '/');
		// the welcome tour is aria-modal and would eat the click: mark it done, then the reload has none
		await other.evaluate(async () => {
			await fetch('/api/me/prefs', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tourState: 'done' }),
			});
		});
		await other.goto('/settings/sharing');
		await other.getByRole('button', { name: 'Make a code' }).click();
		const code = (await other.getByLabel('Your share code').innerText()).trim();
		await page.goto('/settings/sharing');
		await page.getByLabel('Code from the other person').fill(code);
		await page.getByRole('button', { name: 'Add calendar' }).click();
		await expect(page.getByText(/You can now see Print partner's calendar/)).toBeVisible();
	} finally {
		await ctx.close();
	}
}

/** print media at the A4 landscape size the card names (D-V4-18); viewport first, then the emulation */
async function printSheet(page: Page) {
	await page.setViewportSize({ width: 1123, height: 794 });
	await page.emulateMedia({ media: 'print' });
}
const visibleCount = (page: Page, sel: string) =>
	page.locator(sel).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
/** computed colours of one event (its inline colours are what print must override) */
const eventStyle = (loc: Locator) =>
	loc.evaluate((el) => {
		const c = getComputedStyle(el);
		const main = el.querySelector('.fc-event-main');
		return {
			bg: c.backgroundColor,
			leftWidth: c.borderLeftWidth,
			topWidth: c.borderTopWidth,
			rightWidth: c.borderRightWidth,
			bottomWidth: c.borderBottomWidth,
			leftStyle: c.borderLeftStyle,
			leftColor: c.borderLeftColor,
			topColor: c.borderTopColor,
			rightColor: c.borderRightColor,
			bottomColor: c.borderBottomColor,
			mainColor: main ? getComputedStyle(main).color : null,
		};
	});

test('C1 desktop week bar ⋯ has exactly one item, Print week, that calls window.print()', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/week');
	await page.evaluate(() => {
		const w = window as unknown as { ltPrints: number };
		w.ltPrints = 0;
		window.print = () => (w.ltPrints += 1);
	});
	let writes = 0;
	page.on('request', (r) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes++;
	});
	await page.getByRole('button', { name: 'Week menu' }).click();
	const menu = page.getByRole('menu');
	await expect(menu).toBeVisible();
	expect(await menu.getByRole('menuitem').allInnerTexts()).toEqual(['Print week']);
	await menu.getByRole('menuitem', { name: 'Print week' }).click();
	expect(await page.evaluate(() => (window as unknown as { ltPrints: number }).ltPrints)).toBe(1);
	await expect(page.getByRole('menu')).toHaveCount(0);
	// C7: no data, no request, no mutation, so no undo entry / toast
	expect(writes).toBe(0);
	await expect(page.locator('.toast')).toHaveCount(0);
});

test('C2 at phone width no ⋯ / Print week entry shows and the phone week is unchanged', async ({ page }) => {
	await signIn(page);
	await page.setViewportSize({ width: 412, height: 915 });
	await page.goto('/week');
	await expect(page.locator('main.phone')).toBeVisible();
	await expect(page.locator('main.wrap')).toBeHidden();
	await expect(page.locator('.pbar strong')).toBeVisible();
	await expect(page.locator('.pweek .day')).toHaveCount(7);
	await expect(page.getByRole('button', { name: 'Week menu' })).toHaveCount(0);
	await expect(page.locator('.menu-wrap:visible')).toHaveCount(0);
	await expect(page.getByText('Print week')).toHaveCount(0);
});

test('C3 print hides the shell and toolbar, rail and hints, and keeps the week title', async ({
	page,
	browser,
}) => {
	await signIn(page);
	await ensureSharedCalendar(page, browser); // an OverlapToggle button (child component) must be there
	// a week inside one month, so the title is the same-month form
	await page.goto('/week?w=2035-03-05');
	await expect(page.locator('main.wrap .bar .ov')).toBeVisible(); // on screen the shared switch shows
	await printSheet(page);
	await expect(page.locator('.wrap .bar h1')).toBeVisible();
	await expect(page.locator('.wrap .bar h1')).toHaveText(/^\d{1,2} – \d{1,2} \w+ 2035$/);
	expect(await visibleCount(page, 'header.hdr')).toBe(0);
	expect(await visibleCount(page, 'nav.mbar')).toBe(0);
	expect(await visibleCount(page, 'main.wrap .bar .ov')).toBe(0); // decision: hidden in print
	expect(await visibleCount(page, 'main.wrap .bar button')).toBe(0); // prev/next, Today, Overlap, ⋯
	expect(await visibleCount(page, '.view')).toBe(0); // Month | Week switch
	expect(await visibleCount(page, '.types')).toBe(0); // TypeBar
	expect(await visibleCount(page, 'aside.side')).toBe(0); // WeekMap + Not scheduled + stats
	expect(await visibleCount(page, '.foot')).toBe(0);
	expect(await visibleCount(page, 'main.phone')).toBe(0); // the gesture hint lives there
});

test('C4 the printed sheet has 7 day columns, the all-day row, the time grid and no horizontal overflow', async ({
	page,
}) => {
	await signIn(page);
	expect((await api(page, 'PATCH', '/api/me/prefs', { visibleHours: '7-24' })).s).toBe(200); // the default grid
	const stamp = Date.now().toString(36);
	const day = await plusDays(page, 0);
	const title = `C4 item ${stamp}`;
	const label = `C4 block ${stamp}`;
	const item = await mkItem(page, { title, date: day, type: 'Exam' });
	const block = await api(page, 'POST', '/api/blocks', {
		label,
		startAt: utc(day, '10:00'),
		endAt: utc(day, '11:00'),
	});
	expect(block.s).toBe(201);
	try {
		await printSheet(page);
		await page.goto('/week');
		await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);
		await expect(page.locator('.wk .fc-daygrid-body')).toBeVisible(); // all-day row
		await expect(page.locator('.wk .fc-timegrid-body')).toBeVisible(); // time grid
		const allDay = page.locator('.wk .fc-event', { hasText: title });
		await expect(allDay).toBeVisible();
		const timed = page.locator('.wk .fc-event', { hasText: label });
		await expect(timed).toBeVisible();
		const row = (await page.locator('.wk .fc-daygrid-body').boundingBox())!;
		const a = (await allDay.boundingBox())!;
		const b = (await timed.boundingBox())!;
		expect(a.y).toBeLessThan(row.y + row.height + 1); // the item sits in the all-day row
		expect(b.y).toBeGreaterThanOrEqual(row.y + row.height - 1); // the block sits in the time grid
		const wide = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(wide).toBeLessThanOrEqual(1123);
		// the block is still on its 10:00 slot after the print slot height kicks in
		const slot = (await page.locator('.wk td.fc-timegrid-slot[data-time="10:00:00"]').first().boundingBox())!;
		expect(b.y).toBeGreaterThanOrEqual(slot.y - 2);
		expect(b.y).toBeLessThan(slot.y + slot.height);
		// print shrinks the rows so the fixed geometry (bar + day header + divider + 34 slot rows) fits
		// one A4 landscape sheet (794 px minus the 10 mm @page margins). The all-day row is content-
		// dependent (the shared e2e DB leaves many all-day items), so the whole card height is not asserted.
		const usable = 794 - (2 * 10 * 96) / 25.4;
		const h = async (sel: string) => (await page.locator(sel).boundingBox())!.height;
		const bar = await h('main.wrap .wkc > .bar');
		const head = await h('.wk .fc-col-header');
		const divider = await h('.wk .fc-timegrid-divider');
		const slots = await h('.wk .fc-timegrid-slots');
		const rows = await page.locator('.wk .fc-timegrid-slots tr').count();
		const slotPx = slots / rows;
		const fixed = bar + head + divider + slots + 3; // + the card's 1.5 px top/bottom borders
		console.log(
			`C4 print: fixed ${fixed.toFixed(1)}px of ${usable.toFixed(1)}px usable ` +
				`(bar ${bar.toFixed(1)} + header ${head.toFixed(1)} + divider ${divider.toFixed(1)} + ` +
				`${rows} slots × ${slotPx.toFixed(1)} = ${slots.toFixed(1)}), all-day row ${(await h('.wk .fc-daygrid-body')).toFixed(1)}px`,
		);
		expect(rows).toBeGreaterThan(0);
		expect(slotPx).toBeLessThan(17); // print-only slot height
		expect(slotPx).toBeGreaterThan(14); // not squeezed to nothing
		expect(fixed).toBeLessThanOrEqual(usable + 0.5);
		await expect(page.getByRole('alert')).toHaveCount(0);
	} finally {
		await drop(page, 'items', item);
		await drop(page, 'blocks', block.j.block.id);
	}
});

test('C5 print is black on white with the type colour only as a 3 px left border, light and dark', async ({
	page,
}) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const day = await plusDays(page, 0);
	const title = `C5 item ${stamp}`;
	const item = await mkItem(page, { title, date: day, type: 'Exam' });
	try {
		await printSheet(page);
		await page.goto('/week');
		const ev = page.locator('.wk .fc-event', { hasText: title });
		await expect(ev).toBeVisible();
		const light = await eventStyle(ev);
		expect(light.bg).toBe('rgb(255, 255, 255)'); // inline backgroundColor overridden
		expect(light.mainColor).toBe('rgb(0, 0, 0)'); // inline textColor overridden
		expect(light.leftWidth).toBe('3px');
		expect(light.leftStyle).toBe('solid');
		expect(light.leftColor).toBe('rgb(184, 74, 68)'); // Exam line, kept as the type colour
		expect(light.topColor).toBe('rgba(0, 0, 0, 0)');
		expect(light.rightColor).toBe('rgba(0, 0, 0, 0)');
		expect(light.bottomColor).toBe('rgba(0, 0, 0, 0)');

		await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		const dark = await eventStyle(ev);
		expect(dark).toEqual(light); // the same black-on-white sheet
		const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(body).toBe('rgb(255, 255, 255)');
	} finally {
		await drop(page, 'items', item);
	}
});

test('C6 @page is A4 landscape and print forces the 7-column desktop grid at any width', async ({ page }) => {
	await signIn(page);
	await printSheet(page);
	await page.goto('/week');
	const size = await page.evaluate(() => {
		for (const sheet of Array.from(document.styleSheets)) {
			let rules: CSSRuleList;
			try {
				rules = sheet.cssRules;
			} catch {
				continue;
			}
			for (const r of Array.from(rules))
				if (r instanceof CSSPageRule) return r.style.getPropertyValue('size').toLowerCase();
		}
		return null;
	});
	expect(size).toContain('a4');
	expect(size).toContain('landscape');
	await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);

	// D-V4-18: loaded at phone width on screen, then printed — hide .phone, show .wrap, still 7 columns.
	// FullCalendar must re-measure: on screen the grid was 0 px wide inside display:none .wrap.
	await page.emulateMedia({ media: 'screen' });
	await page.setViewportSize({ width: 412, height: 915 });
	await page.goto('/week');
	await expect(page.locator('main.phone')).toBeVisible();
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('main.wrap')).toBeVisible();
	await expect(page.locator('main.phone')).toBeHidden();
	await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);
	const widths = () =>
		page
			.locator('.wk .fc-col-header-cell')
			.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
	await expect.poll(async () => (await widths()).every((w) => w > 0)).toBe(true);
	expect(await widths()).toHaveLength(7);
	const scroll = await page.evaluate(() =>
		Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
	);
	expect(scroll).toBeLessThanOrEqual(1123);
});

test('C7 outside print the page is as today: no screen border, phone keeps its week, menu closes on an outside click', async ({
	page,
}) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const title = `C7 item ${stamp}`;
	const item = await mkItem(page, { title, date: await plusDays(page, 0), type: 'Event' });
	try {
		await page.goto('/week');
		await expect(page.locator('main.wrap')).toBeVisible();
		await expect(page.locator('main.phone')).toBeHidden();
		const ev = page.locator('.wk .fc-event', { hasText: title });
		await expect(ev).toBeVisible();
		const screen = await eventStyle(ev);
		expect(screen.bg).toBe('rgb(211, 238, 206)'); // Event bg, as on screen before
		expect([screen.topWidth, screen.rightWidth, screen.bottomWidth, screen.leftWidth]).toEqual([
			'0px',
			'0px',
			'0px',
			'0px',
		]); // no event border on screen

		await page.getByRole('button', { name: 'Week menu' }).click();
		await expect(page.getByRole('menu')).toBeVisible();
		await page.locator('.wrap .bar h1').click();
		await expect(page.getByRole('menu')).toHaveCount(0);

		await page.setViewportSize({ width: 412, height: 915 });
		await expect(page.locator('main.phone')).toBeVisible();
		await expect(page.locator('.menu-wrap:visible')).toHaveCount(0);
	} finally {
		await drop(page, 'items', item);
	}
});

test('C8 an empty week prints as an empty grid, no loading or error state of its own', async ({ page }) => {
	await signIn(page);
	await printSheet(page);
	await page.goto('/week?w=2031-06-02'); // far week: nothing dated there
	await expect(page.locator('.wk .fc-col-header-cell')).toHaveCount(7);
	await expect(page.locator('.wk .fc-timegrid-body')).toBeVisible();
	await expect(page.locator('.wk .fc-event')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByText(/Loading/)).toHaveCount(0);
});
