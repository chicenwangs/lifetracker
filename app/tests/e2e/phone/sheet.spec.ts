// One shared bottom sheet (#92): half then full, handle tap path, swipe down, scrim, Close, Back.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, signIn, swipe } from './helpers';

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

const openAdd = async () => {
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	return page.getByRole('dialog', { name: 'Add' });
};

test('Add sheet opens at half, grows to full on the handle, Back closes it', async () => {
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
	const sheet = await openAdd();
	await expect(sheet).toBeVisible();
	const half = (await sheet.boundingBox())?.height ?? 0;
	expect(half).toBeLessThanOrEqual(915 * 0.52);

	await page.getByRole('button', { name: 'Expand sheet' }).click();
	await expect(page.getByRole('button', { name: 'Collapse sheet' })).toBeVisible();
	await page.waitForTimeout(350); // height transition
	const full = (await sheet.boundingBox())?.height ?? 0;
	expect(full).toBeGreaterThan(half + 150);

	await page.goBack();
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');
});

test('swipe down on the handle closes the sheet and keeps the page', async () => {
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
	const sheet = await openAdd();
	const handle = page.getByRole('button', { name: 'Expand sheet' });
	await swipe(page, handle, 'down', 200);
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');
});

test('Close button and scrim tap close the sheet', async () => {
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
	let sheet = await openAdd();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(sheet).toBeHidden();

	sheet = await openAdd();
	await page.mouse.click(8, 8); // scrim above the sheet
	await expect(sheet).toBeHidden();
});

test('item peek uses the same sheet and Back closes it', async () => {
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
	await page.goto('/today');
	const today = await page.evaluate(() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	});
	await page.evaluate(
		(date) =>
			fetch('/api/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: 'Sheet test item', date, time: '23:00' }),
			}),
		today,
	);
	await page.goto('/today');
	await page.getByText('Sheet test item', { exact: true }).first().click();
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	await expect(page.getByRole('button', { name: 'Expand sheet' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Close' })).toHaveCount(1); // no duplicate ×

	await page.goBack();
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');
});
