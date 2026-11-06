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
	expect(
		(await api('POST', '/api/courses', { code: 'DS', name: 'Data Structures', aliases: ['ds'] })).s,
	).toBe(201);
	expect((await api('POST', '/api/items', { title: 'DS Quiz', type: 'Exam', date: d })).s).toBe(201);
	expect((await api('POST', '/api/items', { title: 'Groceries', type: 'Event', date: d })).s).toBe(201);
	await page.goto('/');
	const chip = page.locator('.lt-chip', { hasText: 'DS Quiz' });
	await expect(chip).toBeVisible();
	await expect(chip).toHaveCSS('background-color', 'rgb(254, 226, 226)'); // Exam bg
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
	const y = (min: number) => gb.y + (min * 48) / 60;
	await page.mouse.move(gb.x + 150, y(13 * 60) + 2);
	await page.mouse.down();
	await page.mouse.move(gb.x + 150, y(14 * 60 + 30) - 2, { steps: 8 });
	await page.mouse.up();
	await page.fill('#draft-label', 'Prep');
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
	await expect(page.locator('.blk[aria-label^="Sleep, … – 06:00"]')).toBeAttached();
	await page.goto('/');
});

test('drag "DS Quiz" chip to planner -> linked red block', async () => {
	const grid = page.locator('.planner .grid');
	await page
		.locator('.due .chip', { hasText: 'DS Quiz' })
		.dragTo(grid, { targetPosition: { x: 150, y: 16 * 48 + 5 } });
	const b = page.locator('.blk[aria-label^="DS Quiz,"]');
	await expect(b).toHaveAttribute('aria-label', /16:00 – 17:00/);
	await expect(b).toHaveCSS('background-color', 'rgb(254, 226, 226)');
});

test('quick add "ds quiz fri 2pm !exam #ds"', async () => {
	await page.locator('body').click({ position: { x: 5, y: 880 } });
	await page.keyboard.press('n');
	await page.keyboard.type('ds quiz fri 2pm !exam #ds');
	await expect(page.locator('#qa-preview')).toContainText('Exam');
	await expect(page.locator('#qa-preview')).toContainText('#DS');
	await page.keyboard.press('Enter');
	await expect(page.locator('.toast')).toContainText('Added "ds quiz"');
	const d = await today();
	const r = await api('GET', `/api/calendar?from=${d}&to=${plusDay(d, 8)}`);
	const it = (
		r.j as { items: { title: string; type: string; time: string; date: string; courseId: string }[] }
	).items.find((i) => i.title === 'ds quiz');
	expect(it).toMatchObject({ type: 'Exam', time: '14:00' });
	expect(it?.courseId).toBeTruthy();
	expect(new Date(it!.date + 'T00:00:00Z').getUTCDay()).toBe(5); // a Friday
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
