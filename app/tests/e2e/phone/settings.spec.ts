// Settings on phone (#100): a grouped list (icon, label, current value); a row opens its section with Back + its
// name in the top bar; no sideways chip row.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

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

test('list: groups, every section, current values, no sideways scroll', async () => {
	await page.goto('/settings');
	await expect(page).toHaveURL(/\/settings$/);
	for (const g of ['You', 'Planner', 'Account and data', 'Help'])
		await expect(page.getByRole('heading', { name: g })).toBeVisible();
	for (const s of [
		'Account',
		'Preferences',
		'Item types',
		'Notifications',
		'Calendar feed',
		'Devices',
		'Sharing',
		'Trash',
		'Help',
	])
		await expect(page.getByRole('main').getByRole('link', { name: new RegExp(`^${s}`) })).toBeVisible();
	await expect(page.getByRole('link', { name: /^Account @/ })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Settings' })).toBeHidden();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await expectTargets48(page);
});

test('row opens the section; top bar has its name; Back returns to the list', async () => {
	await page
		.getByRole('main')
		.getByRole('link', { name: /^Notifications/ })
		.click();
	await expect(page).toHaveURL(/\/settings\/notifications$/);
	await expect(page.getByRole('banner')).toContainText('Notifications');
	await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	// opened straight (no in-app history): Back goes to the list, not Today
	const fresh = await page.context().newPage();
	await fresh.goto('/settings/types');
	await fresh.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(fresh).toHaveURL(/\/settings$/);
	await fresh.close();
});

test('Notifications: the three reminder rows are 48 dp on phone (#404)', async () => {
	await page.goto('/settings/notifications');
	for (const name of ['Planner items and blocks', 'Keep notes', 'Database records']) {
		const row = page.locator('label.opt').filter({ hasText: name });
		const b = await row.boundingBox();
		expect(Math.round(b?.height ?? 0)).toBeGreaterThanOrEqual(48);
	}
	await expectTargets48(page);
});

test('Preferences: no hidden-header-button or mouse wording on phone (#301)', async () => {
	await page.goto('/settings/preferences');
	await expect(page.getByRole('heading', { name: 'Planner defaults' })).toBeVisible();
	const text = await page.getByRole('main').innerText();
	expect(text).not.toMatch(/sun \/ moon|click/i);
});

test('Calendar feed (v3.2 PR 7): 48 dp buttons, link shown once, no desktop words', async () => {
	await page.goto('/settings/calendar');
	await page.getByRole('button', { name: 'Create feed link' }).click();
	await expect(page.getByRole('textbox', { name: 'Feed link' })).toHaveValue(/\/cal\/.+\.ics$/);
	await expectTargets48(page);
	await noDesktopHints(page);
	await page.getByRole('button', { name: 'Turn off' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByRole('button', { name: 'Create feed link' })).toBeVisible();
});
