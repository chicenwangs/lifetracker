// Item on phone (#108): tapping it anywhere opens the shared item sheet (not the desktop page); no breadcrumb,
// phone wording; Open full = the item screen with Back + title, fields as 48 dp rows.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let T = '';
let id = '';
const sheet = () => page.getByRole('dialog', { name: 'Item' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	T = `Sheet item ${info.project.name}`;
	id = await page.evaluate(async (title) => {
		const r = await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, date: '2030-05-14', time: '10:00' }) }); // prettier-ignore
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, T);
});
test.afterAll(() => page.context().close());

test('Week row opens the item sheet; Back closes it and stays on Week', async () => {
	await page.goto('/week?w=2030-05-13');
	await page.getByRole('link', { name: new RegExp(T) }).click();
	await expect(sheet()).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/item/${id}$`));
	await expect(sheet().getByRole('navigation', { name: 'Breadcrumb' })).toBeHidden();
	await expect(sheet().getByText('Tap to write notes')).toBeVisible();
	await noDesktopHints(page);
	await page.goBack();
	await expect(sheet()).toBeHidden();
	await expect(page).toHaveURL(/\/week/);
});

test('Month agenda and search open the same sheet', async () => {
	await page.goto('/month?m=2030-05&d=2030-05-14');
	await page.locator('.agenda button.row', { hasText: T }).click();
	await expect(sheet()).toBeVisible();
	await page.goBack();
	await expect(sheet()).toBeHidden();
	await page
		.getByRole('banner')
		.getByRole('button', { name: /^Search/ })
		.click();
	await page.getByRole('combobox', { name: 'Search' }).fill(T);
	await page
		.getByRole('option', { name: new RegExp(T) })
		.first()
		.click();
	await expect(sheet()).toBeVisible();
});

test('Open full: Back + title, fields as 48 dp rows', async () => {
	await sheet().getByRole('link', { name: 'Open full' }).click();
	await expect(page).toHaveURL(new RegExp(`/item/${id}$`));
	await expect(sheet()).toBeHidden();
	await expect(page.getByRole('banner').getByRole('button', { name: 'Back' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeHidden();
	for (const f of ['Type', 'Date', 'Time', 'Until']) {
		const b = await page.locator('label.prop', { hasText: f }).first().boundingBox();
		expect(b!.height).toBeGreaterThanOrEqual(48);
	}
	await noDesktopHints(page);
	await expectTargets48(page);
});
