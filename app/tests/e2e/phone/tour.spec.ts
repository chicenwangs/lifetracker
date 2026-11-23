// Phone welcome tour (#83 / #84): its own steps on the tab bar, touch words, every step reachable, Finish ends it.
import { expect, test, type Page } from '@playwright/test';
import { noDesktopHints, signIn } from './helpers';

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

test('restart from Help: phone steps, no desktop words, Finish ends it', async () => {
	await page.goto('/settings/help');
	await page.getByRole('button', { name: 'Restart the tour' }).click();
	const seen: string[] = [];
	for (let i = 0; i < 12; i++) {
		const dlg = page
			.getByRole('dialog')
			.filter({ has: page.getByRole('button', { name: /^(Next|Finish)$/ }) });
		await expect(dlg).toBeVisible();
		seen.push((await dlg.getByRole('heading').innerText()).trim());
		await noDesktopHints(page);
		expect(await dlg.innerText()).not.toMatch(/on the (left|right)|\bPC\b|press N/i); // "left = delete" is a swipe, fine
		const finish = dlg.getByRole('button', { name: 'Finish' });
		if (await finish.isVisible()) {
			await finish.click();
			break;
		}
		await dlg.getByRole('button', { name: 'Next' }).click();
	}
	expect(seen).toEqual(['Welcome to Life Tracker', 'Today', 'Add', 'Your plans', 'Calendar', 'Keep', 'Pages', "You're set"]); // prettier-ignore
	await expect(page.getByRole('button', { name: 'Skip tour' })).toHaveCount(0);
});

test('Back closes the tour and leaves the page behind it alone (#300)', async () => {
	await page.goto('/settings/help');
	await page.getByRole('button', { name: 'Restart the tour' }).click();
	const tour = page.getByRole('dialog', { name: 'Welcome to Life Tracker' });
	await expect(tour).toBeVisible();
	const url = page.url();
	await page.goBack();
	await expect(tour).toHaveCount(0);
	expect(page.url()).toBe(url);
});
