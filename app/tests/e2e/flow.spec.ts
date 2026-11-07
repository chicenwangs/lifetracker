// P1 acceptance (REQUIREMENTS §6) end to end on a fresh DB. Runs in order.
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

test.describe.configure({ mode: 'serial' });

const PW = 'good pass phrase';
let page: Page;

async function api(m: string, p: string, b?: unknown) {
	return page.evaluate(
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
}
const today = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()));
const utc = (d: string, hm: string) => new Date(`${d}T${hm}:00+08:00`).toISOString().slice(0, 19) + 'Z';
const plusDay = (d: string, n: number) =>
	new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
});

test('fresh DB -> /setup -> admin; /setup then 404', async () => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await page.fill('#tk', 'e2e-setup-token');
	await page.fill('#p', PW);
	await page.fill('#cp', PW);
	await page.click('button[type=submit]');
	await expect(page).toHaveURL(/\/$/);
	const r = await page.request.get('/setup');
	expect(r.status()).toBe(404);
});

test('remember ON = Max-Age cookie; OFF = session cookie', async ({ browser }) => {
	for (const remember of [true, false]) {
		const ctx = await browser.newContext();
		const p = await ctx.newPage();
		await p.goto('/login');
		await p.fill('#u', 'jeremy');
		await p.fill('#p', PW);
		if (!remember) await p.uncheck('input[name=remember]');
		await p.click('button[type=submit]');
		await expect(p).toHaveURL(/\/$/);
		const c = (await ctx.cookies()).find((x) => x.name === 'lt_session');
		expect(c?.httpOnly).toBe(true);
		if (remember) expect(c?.expires ?? -1).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
		else expect(c?.expires).toBe(-1);
		await ctx.close();
	}
});

test('5 bad passwords -> locked message with minutes', async ({ browser }) => {
	const p = await (await browser.newContext()).newPage();
	for (let i = 0; i < 4; i++) {
		await p.goto('/login');
		await p.fill('#u', 'jeremy');
		await p.fill('#p', 'wrong-password-' + i);
		await p.click('button[type=submit]');
		await expect(p.locator('.alert')).toContainText(`${4 - i} tr`);
	}
	await p.fill('#p', 'wrong-again-x');
	await p.click('button[type=submit]');
	await expect(p.locator('.alert')).toContainText(/Too many tries. Try again in \d+ min/);
});

test('month shows colour chips; square cycles + persists', async () => {
	const d = await today();
	// courses + goals were removed (2026-11-08): their API is gone
	expect((await api('POST', '/api/courses', { code: 'DS', name: 'x' })).s).toBe(404);
	expect((await api('GET', '/api/goals')).s).toBe(404);
	expect((await api('POST', '/api/items', { title: 'DS Quiz', type: 'Exam', date: d })).s).toBe(201);
	expect((await api('POST', '/api/items', { title: 'Groceries', type: 'Event', date: d })).s).toBe(201);
	await page.goto('/');
	const chip = page.locator('.lt-chip', { hasText: 'DS Quiz' });
	await expect(chip).toBeVisible();
	await expect(chip).toHaveCSS('background-color', 'rgb(80, 15, 28)'); // Exam bg (dark theme = default)
	await chip.locator('.lt-sq').click();
	await expect(chip.locator('.lt-sq')).toHaveAttribute('aria-label', /In progress/);
	await page.reload();
	await expect(page.locator('.lt-chip', { hasText: 'DS Quiz' }).locator('.lt-sq')).toHaveAttribute(
		'aria-label',
		/In progress/,
	);
});

test('planner: drag 13:00-14:30, resize to 14:45; 23:00-06:00 on both days', async () => {
	const grid = page.locator('.planner .grid');
	const gb = (await grid.boundingBox())!;
	const y = (min: number) => gb.y + ((min - 7 * 60) * 48) / 60; // grid starts 07:00 (default roll)
	await page.mouse.move(gb.x + 150, y(13 * 60) + 2);
	await page.mouse.down();
	await page.mouse.move(gb.x + 150, y(14 * 60 + 30) - 2, { steps: 8 });
	await page.mouse.up();
	const box = page.locator('.planner .lt-slotcmd input');
	await expect(box).toBeFocused();
	await box.fill('Prep');
	await page.keyboard.press('Enter');
	const blk = page.locator('.blk[aria-label^="Prep,"]');
	await expect(blk).toHaveAttribute('aria-label', /13:00 – 14:30/);
	const bb = (await blk.boundingBox())!;
	await page.mouse.move(bb.x + 40, bb.y + bb.height - 2);
	await page.mouse.down();
	await page.mouse.move(bb.x + 40, bb.y + bb.height + 10, { steps: 6 });
	await page.mouse.up();
	await expect(blk).toHaveAttribute('aria-label', /13:00 – 14:45/);

	const d = await today();
	expect(
		(
			await api('POST', '/api/blocks', {
				label: 'Sleep',
				startAt: utc(d, '23:00'),
				endAt: utc(plusDay(d, 1), '06:00'),
			})
		).s,
	).toBe(201);
	await page.goto(`/?d=${d}`);
	await expect(page.locator('.blk[aria-label^="Sleep, 23:00 – …"]')).toBeVisible();
	await page.goto(`/?d=${plusDay(d, 1)}`);
	// 00:00-07:00 is rolled up by default: the strip names what is hidden, click shows it
	const top = page.getByRole('separator', { name: /Timeline starts at 07:00/ });
	await expect(top).toContainText('00:00 – 07:00');
	await expect(top).toContainText('Sleep');
	await expect(page.locator('.blk[aria-label^="Sleep, … – 06:00"]')).toHaveCount(0);
	await top.click();
	await expect(page.locator('.blk[aria-label^="Sleep, … – 06:00"]')).toBeVisible();
	// drag the top edge back down 7 h (row-resize), grid stays top-justified, survives reload
	const h = page.getByRole('separator', { name: /Timeline starts at 00:00/ });
	await expect(h).toHaveCSS('cursor', 'row-resize');
	const hb = (await h.boundingBox())!;
	await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
	await page.mouse.down();
	await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 7 * 48, { steps: 10 });
	await page.mouse.up();
	await expect(page.getByRole('separator', { name: /Timeline starts at 07:00/ })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('separator', { name: /Timeline starts at 07:00/ })).toContainText('Sleep');
	const g = (await page.locator('.planner .grid').boundingBox())!;
	const sc = (await page.locator('.planner .scroll').boundingBox())!;
	expect(g.y - sc.y).toBeLessThan(30); // top-justified under the strip
	await page.goto('/');
});

test('drag "DS Quiz" chip to planner -> linked red block', async () => {
	const grid = page.locator('.planner .grid');
	await page
		.locator('.due .chip', { hasText: 'DS Quiz' })
		.dragTo(grid, { targetPosition: { x: 150, y: (16 - 7) * 48 + 5 } });
	const b = page.locator('.blk[aria-label^="DS Quiz,"]');
	await expect(b).toHaveAttribute('aria-label', /16:00 – 17:00/);
	await expect(b).toHaveCSS('background-color', 'rgb(80, 15, 28)');
});

test('quick add palette: planner by default, /calendar big events, /both', async () => {
	await page.locator('body').click({ position: { x: 5, y: 880 } });
	await page.keyboard.press('n');
	const dlg = page.getByRole('dialog', { name: 'Quick add' });
	await expect(dlg).toBeVisible();
	// slash menu
	await page.keyboard.type('ds quiz fri 2pm /ex');
	await expect(dlg.getByRole('listbox')).toContainText('/exam');
	await page.keyboard.press('Tab');
	await expect(page.locator('#qa-slots')).toContainText('Exam');
	// # is plain title text now (no course menu)
	await page.keyboard.type('#ds');
	await expect(dlg.getByRole('listbox')).toHaveCount(0);
	await expect(page.locator('#qa-slots')).toContainText('Planner · default');
	// time typed -> live timeline window beside the palette, draft follows the typing
	const tl = page.locator('.tlp');
	await expect(tl).toBeVisible();
	await expect(tl.locator('.draft')).toContainText('14:00 – 15:00');
	// problems only on Enter
	await page.keyboard.press('Escape'); // clear text
	await expect(tl).toHaveCount(0);
	await page.keyboard.type('call mum tommorow');
	await expect(page.locator('#qa-err')).toHaveCount(0);
	await page.keyboard.press('Enter');
	await expect(page.locator('#qa-err')).toContainText('Planner entries need a time');
	await page.keyboard.press('Escape'); // clear text
	// big event -> calendar only
	await page.keyboard.type('ds quiz fri 2pm /exam /calendar ');
	await page.keyboard.press('Enter');
	await expect(dlg.locator('.log')).toContainText('Added ds quiz to calendar');
	// filler -> planner only, snapped, typo day word
	await page.keyboard.type('e2e drive tommorow 6:07pm to 8pm');
	await page.keyboard.press('Enter');
	await expect(dlg.locator('.log')).toContainText('Added e2e drive to planner');
	// both
	await page.keyboard.type('/hobby e2e outing tmrw 2pm to 4pm /both ');
	await page.keyboard.press('Enter');
	await expect(dlg.locator('.log')).toContainText('Added e2e outing to calendar + planner');
	await page.keyboard.press('Escape');
	await expect(dlg).toHaveCount(0);

	const d = await today();
	const r = await api('GET', `/api/calendar?from=${d}&to=${plusDay(d, 8)}`);
	const j = r.j as {
		items: { id: string; title: string; type: string; time: string; date: string }[];
		blocks: { label: string; itemId: string | null; startAt: string; endAt: string }[];
	};
	const quiz = j.items.find((i) => i.title === 'ds quiz');
	expect(quiz).toMatchObject({ type: 'Exam', time: '14:00' });
	expect(new Date(quiz!.date + 'T00:00:00Z').getUTCDay()).toBe(5); // a Friday
	expect(j.blocks.some((b) => b.itemId === quiz?.id)).toBe(false);
	// planner-only: block, no calendar item
	expect(j.items.some((i) => i.title === 'e2e drive')).toBe(false);
	const drive = j.blocks.find((b) => b.label === 'e2e drive');
	expect(drive?.itemId).toBeNull();
	expect(drive?.startAt.slice(11, 16)).toBe('10:00'); // 18:00 KL
	expect(drive?.endAt.slice(11, 16)).toBe('12:00');
	// both: item + linked block
	const outing = j.items.find((i) => i.title === 'e2e outing');
	expect(outing?.time).toBe('14:00');
	expect(j.blocks.find((b) => b.itemId === outing?.id)?.startAt.slice(11, 16)).toBe('06:00');
});

test('planner drag box takes commands: typed time moves the box, /calendar option', async () => {
	await page.goto('/');
	const grid = page.locator('.planner .grid');
	const gb = (await grid.boundingBox())!;
	const y = (min: number) => gb.y + ((min - 7 * 60) * 48) / 60; // grid starts 07:00 (default roll)
	await page.mouse.move(gb.x + 150, y(9 * 60) + 2);
	await page.mouse.down();
	await page.mouse.move(gb.x + 150, y(10 * 60) - 2, { steps: 6 });
	await page.mouse.up();
	const box = page.locator('.planner .lt-slotcmd input');
	await expect(box).toBeFocused();
	await page.keyboard.type('e2e cmd block /hobby 5pm to 6:30pm');
	await expect(page.locator('.planner .draft')).toContainText('17:00 – 18:30');
	await page.keyboard.press('Enter');
	await expect(page.locator('.blk[aria-label^="e2e cmd block,"]')).toHaveAttribute(
		'aria-label',
		/17:00 – 18:30/,
	);
	// calendar option via the toggle
	await page.mouse.move(gb.x + 150, y(19 * 60) + 2);
	await page.mouse.down();
	await page.mouse.move(gb.x + 150, y(20 * 60) - 2, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.type('e2e cal from drag');
	await page.locator('.planner .lt-slotcmd').getByRole('button', { name: 'Calendar' }).click();
	await expect(page.locator('.planner .lt-slotcmd input')).toHaveValue('e2e cal from drag /calendar ');
	await page.keyboard.press('Enter');
	const d = await today();
	const r = await api('GET', `/api/calendar?from=${d}&to=${plusDay(d, 1)}`);
	const j = r.j as { items: { title: string; time: string | null }[] };
	expect(j.items.find((i) => i.title === 'e2e cal from drag')?.time).toBe('19:00');
});

test('week drag box: same commands, typed time moves the selection', async () => {
	const d = await today();
	await page.goto('/week');
	const col = (await page.locator(`.fc-timegrid-col[data-date="${d}"]`).boundingBox())!;
	const row = async (t: string) =>
		(await page.locator(`.fc-timegrid-slot-lane[data-time="${t}"]`).boundingBox())!;
	const a = await row('08:00:00');
	const b = await row('08:30:00');
	await page.mouse.move(col.x + col.width / 2, a.y + 3);
	await page.mouse.down();
	await page.mouse.move(col.x + col.width / 2, b.y + b.height - 3, { steps: 6 });
	await page.mouse.up();
	const pop = page.getByRole('dialog', { name: 'New entry' });
	await expect(pop).toContainText('08:00 – 09:00');
	await expect(pop.locator('input')).toBeFocused();
	await page.keyboard.type('e2e week cmd /work 9:15am to 10am');
	await expect(page.locator('.fc-highlight, .fc-event-mirror').first()).toBeVisible();
	await page.waitForTimeout(300);
	await page.screenshot({
		path: '/tmp/claude-0/-home-claude/1f730014-c7d0-52ee-a785-cecc649b2d5b/scratchpad/week.png',
	});
	await page.keyboard.press('Enter');
	await expect(pop).toHaveCount(0);
	const r = await api('GET', `/api/calendar?from=${d}&to=${plusDay(d, 1)}`);
	const j = r.j as { blocks: { label: string; startAt: string; endAt: string; type: string | null }[] };
	const blk = j.blocks.find((x) => x.label === 'e2e week cmd');
	expect(blk && [blk.startAt, blk.endAt, blk.type]).toEqual([utc(d, '09:15'), utc(d, '10:00'), 'Work']);
	// Esc cancels
	await page.mouse.move(col.x + col.width / 2, a.y + 3);
	await page.mouse.down();
	await page.mouse.move(col.x + col.width / 2, b.y + b.height - 3, { steps: 6 });
	await page.mouse.up();
	await expect(pop).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(pop).toHaveCount(0);
	// month heatmap on top of the side column, this week highlighted
	const map = page.getByRole('region', { name: 'Month overview' });
	await expect(map).toContainText(/Week \d of \d/);
	await expect(map.locator('.row.on')).toHaveCount(1);
	// one dashed box while selecting (no doubled highlight)
	await page.mouse.move(col.x + col.width / 2, a.y + 3);
	await page.mouse.down();
	await page.mouse.move(col.x + col.width / 2, b.y + b.height - 3, { steps: 6 });
	await page.mouse.up();
	await expect(page.locator('.fc-highlight').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(page.locator('.fc-event-mirror')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(pop).toHaveCount(0);
	// drag a plain block onto Not scheduled -> becomes an all-day item there, block gone
	const notsch = page.getByRole('region', { name: 'Not scheduled' });
	const ev = page.locator('.lt-blk', { hasText: 'e2e week cmd' });
	await ev.scrollIntoViewIfNeeded();
	const eb = (await ev.boundingBox())!;
	const nb = (await notsch.boundingBox())!;
	await page.mouse.move(eb.x + 30, eb.y + 8);
	await page.mouse.down();
	await page.mouse.move(eb.x + 60, eb.y + 40, { steps: 5 });
	await expect(notsch).toHaveClass(/drop/);
	await page.mouse.move(nb.x + nb.width / 2, nb.y + 30, { steps: 12 });
	await page.mouse.up();
	await expect(page.locator('.lt-blk', { hasText: 'e2e week cmd' })).toHaveCount(0);
	await expect(notsch.locator('.row', { hasText: 'e2e week cmd' })).toBeVisible();
	// ⊗ on the list row deletes it (undo toast like Home)
	await notsch.locator('.row', { hasText: 'e2e week cmd' }).hover();
	await notsch.getByRole('button', { name: 'Delete e2e week cmd' }).click();
	await expect(notsch.locator('.row', { hasText: 'e2e week cmd' })).toHaveCount(0);
	await expect(page.locator('.toast, [role=status]').first()).toContainText('Deleted');
	// ⊗ on a timeline block
	const drive = page.locator('.lt-blk', { hasText: 'e2e drive' });
	if (await drive.count()) {
		await drive.hover();
		await drive.getByRole('button', { name: 'Delete e2e drive' }).click();
		await expect(page.locator('.lt-blk', { hasText: 'e2e drive' })).toHaveCount(0);
	}
	// gap between all-day row and first hour; bottom edge rolls late hours (shared setting)
	const allDay = (await page.locator('.fc-daygrid-body').first().boundingBox())!;
	const first = await row('07:00:00');
	expect(first.y - (allDay.y + allDay.height)).toBeGreaterThanOrEqual(18);
	const bot = page.getByRole('separator', { name: /Timeline ends at 24:00/ });
	await bot.scrollIntoViewIfNeeded();
	const bb = (await bot.boundingBox())!;
	await page.mouse.move(bb.x + 200, bb.y + bb.height / 2);
	await page.mouse.down();
	await page.mouse.move(bb.x + 200, bb.y + bb.height / 2 - 48, { steps: 6 });
	await page.mouse.up();
	await expect(page.getByRole('separator', { name: /Timeline ends at 23:00/ })).toContainText('Sleep');
	await expect(page.locator('.fc-timegrid-slot-lane[data-time="23:00:00"]')).toHaveCount(0);
	await page.getByRole('separator', { name: /Timeline ends at 23:00/ }).click();
	await expect(page.locator('.fc-timegrid-slot-lane[data-time="23:00:00"]')).toHaveCount(1);
});

test('item opens as centre peek: blur, rename in place, notes, linked block, hover X', async () => {
	const d = await today();
	await page.goto(`/?d=${d}`);
	const chip = page.locator('.lt-chip', { hasText: /DS Quiz/ });
	// exam countdown on the chip
	await expect(chip.locator('.lt-dl')).toHaveText('Today');
	await chip.locator('.lt-title').click();
	const dlg = page.getByRole('dialog', { name: 'Item' });
	await expect(dlg).toBeVisible();
	await expect(page).toHaveURL(/\/item\/itm_/);
	await expect(page.locator('.scrim')).toHaveCSS('backdrop-filter', /blur/);
	await expect(dlg.locator('.count')).toHaveText('Due today');
	// rename on the title itself
	await dlg.locator('.title-btn').click();
	await dlg.locator('#iv-title').fill('DS Quiz 2');
	await page.keyboard.press('Enter');
	await expect(dlg.locator('.title-btn .tt')).toHaveText('DS Quiz 2');
	// markdown page
	await dlg.locator('.empty').click();
	await dlg.locator('#iv-notes').fill('# Plan\n- chapter 3');
	await expect(dlg.locator('.savestate')).toContainText('Saved');
	await page.keyboard.press('Escape');
	await expect(dlg.locator('.rendered h1')).toHaveText('Plan');
	// drag empty time in the item's timeline -> linked block in item colour
	const grid = dlg.locator('.planner .grid');
	await grid.scrollIntoViewIfNeeded();
	const sc = dlg.locator('.planner .scroll');
	await sc.evaluate((el) => (el.scrollTop = 2 * 48));
	const gb = (await grid.boundingBox())!;
	const y = (min: number) => gb.y + ((min - 7 * 60) * 48) / 60; // grid starts 07:00 (default roll)
	await page.mouse.move(gb.x + 150, y(10 * 60) + 2);
	await page.mouse.down();
	await page.mouse.move(gb.x + 150, y(11 * 60) - 2, { steps: 8 });
	await page.mouse.up();
	const b = dlg.locator('.blk[aria-label^="DS Quiz 2, 10:00 – 11:00"]');
	await expect(b).toBeVisible();
	await expect(b).toHaveCSS('background-color', 'rgb(80, 15, 28)');
	// Esc closes, home planner shows the same linked block
	await page.keyboard.press('Escape');
	await expect(dlg).toBeHidden();
	await expect(page).toHaveURL(/\/(\?d=.*)?$/);
	const home = page.locator('.home .blk[aria-label^="DS Quiz 2, 10:00 – 11:00"]');
	await expect(home).toBeAttached();
	// hover X deletes it (with undo)
	await home.scrollIntoViewIfNeeded();
	await home.hover();
	await expect(home.locator('.bx')).toHaveCSS('opacity', '1');
	await home.locator('.bx').click();
	await expect(page.locator('.toast')).toContainText('Deleted');
	await expect(home).toHaveCount(0);
	await page.locator('.toast .undo').click();
	await expect(home).toBeAttached();
});

test('theme: dark by default, toggle persists on server', async () => {
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('button', { name: 'Switch to light mode' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.getByRole('button', { name: 'Switch to dark mode' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('plan ahead "before bed": after today ends, Home opens on tomorrow', async () => {
	const d = await today();
	// a block that ended 1 min ago today (if it is just past midnight there is no "today" before now; skip)
	const nowMin = await page.evaluate(() => {
		const p = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Asia/Kuala_Lumpur',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		}).format(new Date());
		const [h, m] = p.split(':').map(Number);
		return (h ?? 0) * 60 + (m ?? 0);
	});
	test.skip(nowMin < 20, 'too close to midnight');
	// clear today's later blocks so "last item" is in the past
	const cal = await api('GET', `/api/calendar?from=${d}&to=${plusDay(d, 1)}`);
	for (const b of (cal.j as { blocks: { id: string }[] }).blocks) await api('DELETE', `/api/blocks/${b.id}`);
	for (const i of (cal.j as { items: { id: string; time: string | null }[] }).items)
		if (i.time) await api('PATCH', `/api/items/${i.id}`, { time: null });
	const hm = (m: number) =>
		`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	expect(
		(
			await api('POST', '/api/blocks', {
				label: 'Done thing',
				startAt: utc(d, hm(nowMin - 16)),
				endAt: utc(d, hm(nowMin - 1)),
			})
		).s,
	).toBe(201);
	await page.goto('/settings/preferences');
	await page.getByLabel('Before bed').check();
	await expect(page.locator('.toast')).toContainText('Saved');
	await page.goto('/');
	await expect(page.locator('.ahead')).toBeVisible();
	await expect(page.locator('.planner [aria-label^="Planner for"]')).toHaveAttribute(
		'aria-label',
		new RegExp(`\\b${Number(plusDay(d, 1).slice(8))}\\b`),
	);
	await page.goto('/settings/preferences');
	await page.getByLabel('Off').check();
	await page.goto('/');
	await expect(page.locator('.ahead')).toHaveCount(0);
});

test('reset-password script works', async ({ browser }) => {
	execFileSync('node', ['scripts/reset-password.mjs', 'jeremy'], {
		input: 'reset pass phrase 1\n',
		env: { ...process.env, DATABASE_PATH: join(process.env.E2E_DIR as string, 'app.db') },
	});
	const p = await (await browser.newContext()).newPage();
	await p.goto('/login');
	await p.fill('#u', 'jeremy');
	await p.fill('#p', 'reset pass phrase 1');
	await p.click('button[type=submit]');
	await expect(p).toHaveURL(/\/$/);
	// old session killed
	const r = await page.request.get('/api/calendar?from=2026-01-01&to=2026-01-02');
	expect(r.status()).toBe(401);
});
