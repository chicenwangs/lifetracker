// Phone wording and titles (#286): 404 top bar has a title; the graph legend uses touch words.
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

test('404: the top bar reads "Not found"', async () => {
	await page.goto('/no-such-route-286');
	await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
	await expect(page.getByRole('banner')).toContainText('Not found');
});

test('graph legend has no mouse wording', async () => {
	test.skip(test.info().project.name !== 'phone', 'landscape opens the canvas, not the list');
	await page.evaluate(async () => {
		await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Legend page' }) }); // prettier-ignore
	});
	await page.goto('/pages/graph');
	await page.getByRole('button', { name: 'Show graph' }).click();
	await expect(page.locator('.legend')).toContainText('Tap a page');
	await noDesktopHints(page);
});
