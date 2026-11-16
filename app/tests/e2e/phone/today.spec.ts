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

test('the day follows the finger; a short drag snaps back, a long one steps', async () => {
	await page.goto('/today?d=2030-01-15');
	const area = page.getByRole('group', { name: /The day/ });
	const b = (await area.boundingBox())!;
	const y = b.y + 40;
	const f = await finger(page);
	await f.send('touchStart', 300, y);
	for (let x = 290; x >= 200; x -= 10) await f.send('touchMove', x, y);
	await expect.poll(() => area.evaluate((el) => getComputedStyle(el).translate)).toMatch(/^-\d/);
	await expect(page.getByText(/16 Jan 2030/)).toBeVisible(); // the next day peeks in
	await f.send('touchEnd');
	await f.done();
	await expect.poll(() => area.evaluate((el) => getComputedStyle(el).translate)).toBe('none');
	expect(day()).toBe('2030-01-15');
	await swipe(page, area, 'left', 250);
	await expect.poll(day).toBe('2030-01-16');
	await swipe(page, area, 'right', 250);
	await expect.poll(day).toBe('2030-01-15');
});

test('title opens a date picker (tap path to any day)', async () => {
	await page.goto('/today?d=2030-01-15');
	await expect(page.getByRole('button', { name: /Pick a day/ })).toBeVisible();
	await page.locator('input[type=date]').fill('2030-03-01');
	await expect.poll(day).toBe('2030-03-01');
});
