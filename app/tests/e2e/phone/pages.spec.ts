// Pages on phone (#98): toolbar docks to the bottom only while typing, 48 dp, no Ctrl hints; block actions in a
// sheet; Pin + Share in the ⋯ menu.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, expectTappable, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const tools = () => page.getByRole('toolbar', { name: 'Formatting and block tools' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t }) }); // prettier-ignore
		return ((await r.json()) as { page: { id: string } }).page.id;
	}, `Phone editor ${info.project.name}`);
	await page.goto(`/pages/${id}`);
});
test.afterAll(() => page.context().close());

test('toolbar hidden until typing, then docked at the bottom, 48 dp, no Ctrl', async () => {
	await expect(tools()).toBeHidden();
	await page.getByLabel('Page content').click();
	await expect(tools()).toBeVisible();
	const box = await tools().boundingBox();
	const vh = page.viewportSize()!.height;
	expect(Math.round(box!.y + box!.height)).toBe(vh);
	await expectTargets48(page);
	await noDesktopHints(page);
	await expect(tools().locator('[title*="Ctrl"]')).toHaveCount(0);
	// a toolbar tap keeps the text focused (toolbar stays)
	await tools().getByRole('button', { name: 'Bold' }).click();
	await expect(tools().getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
	await expect(tools()).toBeVisible();
	await page.getByLabel('Page title').click();
	await expect(tools()).toBeHidden();
});

test('"/" menu and page ⋯ menu rows are 48 dp (#228, #223)', async () => {
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
	await expectTargets48(page);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Backspace');
	await page.getByLabel('Page title').click();
	await page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeVisible();
	await expectTargets48(page);
	await page.goBack(); // Back closes the menu (#91)
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeHidden();
});

test('block ⋯ = sheet with move, duplicate, delete', async () => {
	await page.getByLabel('Page content').click();
	await page.keyboard.type('first line');
	await tools().getByRole('button', { name: 'Block actions' }).click();
	const sheet = page.getByRole('dialog', { name: 'Actions for Block' });
	await expectTappable(sheet.getByRole('button', { name: 'Duplicate' }));
	await sheet.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.getByLabel('Page content').getByText('first line')).toHaveCount(2);
});

test('Pin and Share live in the ⋯ menu', async () => {
	await page.getByLabel('Page title').click();
	const bar = page.locator('.pagev .bar');
	await expect(bar.getByRole('button', { name: 'Share', exact: true })).toBeHidden();
	await expect(bar.getByRole('button', { name: 'Pin', exact: true })).toBeHidden();
	await bar.getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Share…' }).click();
	await expect(page.getByRole('dialog', { name: /Share/ })).toBeVisible();
});
