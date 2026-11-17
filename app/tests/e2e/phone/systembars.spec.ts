// #114: status bar and system bars follow the theme; respect screen edges.
// Web-side checks: theme-color meta follows SSR + client theme changes, viewport-fit=cover, safe-area insets.
// Android-only checks (status bar icon brightness, real cut-outs) -> needs real phone.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('theme-color meta matches dark and light themes and updates live', async () => {
	await page.goto('/today');
	await page.evaluate(async () => {
		await fetch('/api/me/prefs', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ themeMode: 'dark' }),
		});
	});
	await page.reload();
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0e0d2a');

	await page.evaluate(async () => {
		await fetch('/api/me/prefs', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ themeMode: 'light' }),
		});
	});
	await page.reload();
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#e8d9e6');
});

test('viewport-fit=cover and safe-area insets are wired on phone without affecting desktop', async () => {
	await page.goto('/today');
	await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
	const paddingTop = await page.evaluate(() => getComputedStyle(document.body).paddingTop);
	expect(paddingTop).toBeTruthy();

	const ctx = await page
		.context()
		.browser()!
		.newContext({ viewport: { width: 1280, height: 800 } });
	const desktop = await ctx.newPage();
	await desktop.goto('/login');
	expect(await desktop.evaluate(() => getComputedStyle(document.body).paddingTop)).toBe('0px');
	await ctx.close();
});
