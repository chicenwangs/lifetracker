// Phone smoke: each tab loads, shows the bottom bar, every control is 48 dp (#101). Wording: #115.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, expectTappable, expectTargets48, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let pagePath = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	const id = await page.evaluate(async () => {
		const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Phone smoke page' }) }); // prettier-ignore
		return ((await r.json()) as { page: { id: string } }).page.id;
	});
	pagePath = `/pages/${id}`;
});
test.afterAll(() => page.context().close());

const TABS: [string, () => string][] = [
	['Today', () => '/today'],
	['Week', () => '/week'],
	['Keep', () => '/keep'],
	['More', () => '/more'],
	['a page', () => pagePath],
	['Settings', () => '/settings/preferences'],
	['Month', () => '/month'],
	['Pages', () => '/pages'],
	['Help', () => '/settings/help'],
	['Settings list', () => '/settings'],
];

test('Add sheet: every / command in quick add can be tapped', async () => {
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	await page.keyboard.type('gym tmr 6pm /');
	await expectTappable(page.getByRole('dialog', { name: 'Add' }).getByRole('option'));
	await page.keyboard.press('Escape');
});

for (const [name, path] of TABS) {
	test(`${name} loads and shows the bottom bar`, async () => {
		const res = await page.goto(path());
		expect(res?.status()).toBeLessThan(400);
		await expect(page).not.toHaveURL(/\/login/);
		await expect(bottomBar(page)).toBeVisible();
	});
	test(`${name}: every control is 48×48 (#101)`, async () => {
		await page.goto(path());
		await expectTargets48(page);
	});
	test(`${name}: no desktop wording (#115)`, async () => {
		await page.goto(path());
		await noDesktopHints(page);
	});
}
