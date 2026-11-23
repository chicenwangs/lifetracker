// #313: a sign-out that fails keeps the queued edits and the session; only a successful one wipes.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('failed sign-out: queued edits survive, still signed in', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }); // prettier-ignore
	const page = await ctx.newPage();
	await signIn(page);
	await page.goto('/more', { waitUntil: 'networkidle' }); // hydrated: the mount flush must not see the queue
	await page.evaluate(() => localStorage.setItem('lt_action_queue', JSON.stringify([{ key: 'k1', method: 'POST', path: '/api/items', payload: { title: 'x' }, editedAt: '2026-01-01T00:00:00Z' }]))); // prettier-ignore
	await page.route('**/logout', (r) => r.abort('internetdisconnected')); // the offline POST failure; the page stays put
	await page.getByRole('button', { name: 'Sign out' }).evaluate((b: HTMLButtonElement) => b.click());
	await page.waitForTimeout(3000); // push drop races a 2 s timer, then the POST fails
	await ctx.route('**/api/items', (r) => r.fulfill({ status: 500, body: '{}' })); // the mount flush must keep the op
	const p2 = await ctx.newPage();
	await p2.goto('/more', { waitUntil: 'networkidle' });
	expect(await p2.evaluate(() => localStorage.getItem('lt_action_queue'))).toContain('k1');
	await expect(p2.getByRole('button', { name: 'Sign out' })).toBeVisible();
	await ctx.close();
});
