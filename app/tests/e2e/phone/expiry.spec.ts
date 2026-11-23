// #305: a quick add in flight when the session ended is kept and sent after sign-in, and the sign-in page says why.
import { expect, test } from '@playwright/test';
import { bottomBar, PW, signIn } from './helpers';

test('session expiry mid quick add: text kept, sent after sign-in', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }); // prettier-ignore
	const page = await ctx.newPage();
	await signIn(page);
	await page.goto('/today?d=2030-03-12', { waitUntil: 'networkidle' });
	await bottomBar(page).locator('button.add').click();
	const sheet = page.getByRole('dialog', { name: 'Add' });
	await page.keyboard.type(`expiry305 ${info.project.name} 3pm /calendar`);
	await ctx.clearCookies(); // the session ended on the server
	await sheet.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole('status').filter({ hasText: 'kept and sent after you sign in' })).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('lt_action_queue'))).toContain('expiry305');
	await page.fill('#u', 'jeremy');
	await page.fill('#p', PW);
	await page.click('button[type=submit]');
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
