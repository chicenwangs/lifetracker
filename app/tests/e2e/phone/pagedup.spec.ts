// #307: two fast taps on "New page inside" make one page, not an orphan as well.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('double tap on New page inside creates one page', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	const page = await ctx.newPage();
	await signIn(page);
	const parent = `Dup parent ${info.project.name}`;
	const count = () =>
		page.evaluate(async () => {
			const r = await fetch('/api/pages');
			return ((await r.json()) as { tree: unknown[] }).tree.length;
		});
	await page.evaluate(async (title) => {
		await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) }); // prettier-ignore
	}, parent);
	await page.goto('/pages');
	const before = await count();
	await page
		.getByRole('button', { name: `New page inside ${parent}` })
		.evaluate((b: HTMLButtonElement) => (b.click(), b.click())); // two taps in one tick
	await expect(page).toHaveURL(/\/pages\/pg_/);
	expect(await count()).toBe(before + 1);
	await ctx.close();
});
