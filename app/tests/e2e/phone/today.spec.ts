// Today (#94): week strip you can tap or swipe, the day follows the finger, title opens a date picker.
import { expect, test, type Page } from '@playwright/test';
import { finger, signIn, swipe } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const day = () => new URL(page.url()).searchParams.get('d');

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('strip: 7 days, the day on screen marked, busy days dotted, tap jumps', async () => {
	await page.evaluate(
		() =>
		fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Strip busy', date: '2030-01-16', time: '09:00' }) }), // prettier-ignore
	);
	await page.goto('/today?d=2030-01-15');
	const strip = page.getByRole('navigation', { name: 'This week' });
	await expect(strip.getByRole('button')).toHaveCount(7);
	await expect(strip.locator('[aria-current="date"]')).toContainText('15');
	await expect(strip.getByRole('button', { name: /16 Jan.*has plans/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /^(Previous|Next) day$/ })).toHaveCount(0);
	await strip.getByRole('button', { name: /17 Jan/ }).click();
	await expect.poll(day).toBe('2030-01-17');
});

test('swipe the strip = next / previous week', async () => {
	await page.goto('/today?d=2030-01-15');
	await swipe(page, page.getByRole('navigation', { name: 'This week' }), 'left');
	await expect.poll(day).toBe('2030-01-22');
	await swipe(page, page.getByRole('navigation', { name: 'This week' }), 'right');
	await expect.poll(day).toBe('2030-01-15');
});

// empty days: a horizontal swipe that starts on a row is that row's action (#96), not the day's
test('the day follows the finger; a short drag snaps back, a long one steps', async () => {
	await page.goto('/today?d=2030-01-08');
	const area = page.getByRole('group', { name: /The day/ });
	// a Slipped strip (any overdue item left by an earlier spec) pushes the day down; in landscape the touch
	// point would land under the bottom bar
	await area.evaluate((el) => el.scrollIntoView({ block: 'start' }));
	const b = (await area.boundingBox())!;
	const y = b.y + 40;
	const f = await finger(page);
	await f.send('touchStart', 300, y);
	for (let x = 290; x >= 230; x -= 10) await f.send('touchMove', x, y); // 70 px: under a quarter
	await expect.poll(() => area.evaluate((el) => getComputedStyle(el).translate)).toMatch(/^-\d/);
	await expect(page.getByText(/9 Jan 2030/)).toBeVisible(); // the next day peeks in
	await f.send('touchEnd');
	await f.done();
	await expect.poll(() => area.evaluate((el) => getComputedStyle(el).translate)).toBe('none');
	expect(day()).toBe('2030-01-08');
	await swipe(page, area, 'left', 250);
	await expect.poll(day).toBe('2030-01-09');
	await swipe(page, area, 'right', 250);
	await expect.poll(day).toBe('2030-01-08');
});

test('title opens a date picker (tap path to any day)', async () => {
	await page.goto('/today?d=2030-01-15');
	await expect(page.getByRole('button', { name: /Pick a day/ })).toBeVisible();
	await page.locator('input[type=date]').fill('2030-03-01');
	await expect.poll(day).toBe('2030-03-01');
});

test('tapping a status square shows an Undo snackbar (#310)', async () => {
	const T = `Tick undo ${test.info().project.name}`;
	await page.evaluate(
		(title) =>
			fetch('/api/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title, date: '2030-02-04', time: '09:00' }),
			}),
		T,
	);
	await page.goto('/today?d=2030-02-04');
	const row = page.locator('.ent', { hasText: T });
	await row.locator('button.sq').click();
	await expect(row.locator('button.sq')).toHaveAttribute('aria-label', /In progress/);
	const toast = page.locator('.toast');
	await expect(toast).toContainText(`Started: "${T}"`);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(row.locator('button.sq')).toHaveAttribute('aria-label', /Not started/);
});

test('a tick does not move the timeline under the finger (#379)', async () => {
	const T = `Tick still ${test.info().project.name}`;
	for (let h = 7; h <= 20; h++)
		await page.evaluate(
			([title, time]) =>
				fetch('/api/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ title, date: '2030-03-10', time }),
				}),
			[h === 18 ? T : `${T} filler ${h}`, `${String(h).padStart(2, '0')}:00`] as const,
		); // prettier-ignore
	await page.goto('/today?d=2030-03-10');
	const row = page.getByRole('group', { name: T, exact: true });
	await row.evaluate((n) => n.scrollIntoView({ block: 'center' }));
	const wheel = page.locator('.wheel');
	const before = await wheel.evaluate((w) => w.scrollTop);
	expect(before).toBeGreaterThan(100);
	await row.locator('button.sq').click();
	await expect(row.locator('button.sq')).toHaveAttribute('aria-label', /In progress/);
	await page.waitForTimeout(500); // the old align-on-every-refresh jumped here
	expect(Math.abs((await wheel.evaluate((w) => w.scrollTop)) - before)).toBeLessThan(5);
});
