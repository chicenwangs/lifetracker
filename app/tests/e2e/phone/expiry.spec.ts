// #305: a quick add in flight when the session ended is kept and sent after sign-in, and the sign-in page says why.
import { expect, test } from '@playwright/test';
import { bottomBar, PW, signIn } from './helpers';

test('session expiry mid quick add: text kept, sent after sign-in', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }); // prettier-ignore
	const page = await ctx.newPage();
	await signIn(page);
	await page.goto('/today?d=2030-03-12');
	const sheet = page.getByRole('dialog', { name: 'Add' });
	// a tap before hydration does nothing (CI timed out waiting for a sheet that never opened): retry until it opens
	await expect(async () => {
		if (!(await sheet.isVisible())) await bottomBar(page).locator('button.add').click({ timeout: 5_000 });
		await expect(sheet).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
	const field = sheet.getByRole('combobox', { name: 'What and when' });
	await field.fill(`expiry305 ${info.project.name} 3pm /calendar`, { timeout: 10_000 });
	await ctx.clearCookies(); // the session ended on the server
	await sheet.getByRole('button', { name: 'Add', exact: true }).click({ timeout: 10_000 });
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole('status').filter({ hasText: 'kept and sent after you sign in' })).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('lt_action_queue'))).toContain('expiry305');
	await page.fill('#u', 'jeremy', { timeout: 10_000 });
	await page.fill('#p', PW, { timeout: 10_000 });
	await page.click('button[type=submit]', { timeout: 10_000 });
	await expect(page).not.toHaveURL(/\/login/);
	await expect
		.poll(async () =>
			page.evaluate(async (t) => {
				const r = await fetch('/api/calendar?from=2030-03-12&to=2030-03-13');
				return JSON.stringify(await r.json()).includes(t);
			}, 'expiry305'),
		)
		.toBe(true);
	await ctx.close();
});
