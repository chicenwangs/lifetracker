// Tab bar (#88): Today · Calendar · + · Keep · Pages; account sheet from the avatar; theme not in the phone header.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, expectTappable, signIn } from './helpers';

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

test.beforeEach(() => {});

test('four tabs + Add, each one tap away, active tab marked', async () => {
	await page.goto('/today');
	const bar = bottomBar(page);
	await expect(bar.getByRole('link')).toHaveText(['Today', 'Calendar', 'Keep', 'Pages']);
	await expectTappable(bar.getByRole('link'));
	await expectTappable(bar.getByRole('button', { name: 'Add' }));
	for (const [label, url] of [
		['Calendar', /\/week/],
		['Keep', /\/keep/],
		['Pages', /\/pages/],
		['Today', /\/today/],
	] as const) {
		await bar.getByRole('link', { name: label }).click();
		await expect(page).toHaveURL(url);
		await expect(bar.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
	}
});

test('Month and screens outside the tabs keep a tab lit', async () => {
	const bar = bottomBar(page);
	await page.goto('/week');
	await page.getByRole('link', { name: 'Month' }).click();
	await expect(page).toHaveURL(/\/month/);
	await expect(bar.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
	await page.goto('/keep');
	await bar.getByRole('link', { name: 'Keep' }).click();
	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('dialog', { name: 'Account' }).getByRole('link', { name: 'Trash' }).click();
	await expect(page).toHaveURL(/\/trash/);
	await expect(bar.getByRole('link', { name: 'Keep' })).toHaveAttribute('aria-current', 'page');
});

test('account sheet has everything the old More had; theme toggle is in Settings, not the header', async () => {
	await page.goto('/today');
	await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeHidden();
	await page.getByRole('button', { name: 'Account menu' }).click();
	const sheet = page.getByRole('dialog', { name: 'Account' });
	await expect(sheet.getByRole('link')).toHaveText([
		/Settings/,
		/Shared with me/,
		/Keep archive/,
		/Trash/,
		/Help \+ tour/,
	]);
	await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible();
	await expectTappable(sheet.getByRole('link'));
	await page.goBack();
	await page.goto('/settings/preferences');
	await expect(page.getByText(/theme/i).first()).toBeVisible();
});
