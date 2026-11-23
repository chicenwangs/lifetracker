// 48 dp on surfaces the bare-page checks never open: Add sheet, Keep checklist, database page, graph list (#285).
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, expectTargets48, signIn } from './helpers';

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

test('Add sheet tabs are 48 dp (#285)', async () => {
	await page.goto('/today');
	await bottomBar(page).locator('button.add').click();
	const tab = page.getByRole('tab', { name: 'Plan it' });
	await expect(tab).toBeVisible();
	await page.waitForTimeout(600); // sheet opening animation settles
	await expectTargets48(page);
	await page.goBack();
});

test('Keep checklist: checkbox and grip are 48 dp (#285)', async () => {
	const info = test.info();
	const title = `Targets ${info.project.name}`;
	await page.evaluate(async (t) => {
		await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, type: 'checklist', items: [{ text: 'milk', checked: false, parentId: null }, { text: 'eggs', checked: true, parentId: null }] }) }); // prettier-ignore
	}, title);
	await page.goto('/keep');
	await page.locator('article.note', { hasText: title }).getByText(title).click();
	const note = page.getByRole('dialog', { name: title, exact: true });
	await expect(note.getByRole('checkbox').first()).toBeVisible();
	await expectTargets48(page);
	const grip = await note.locator('.grip').first().boundingBox();
	expect(grip!.width).toBeGreaterThanOrEqual(48);
	expect(grip!.height).toBeGreaterThanOrEqual(48);
	await page.goBack();
});

test('database page controls are 48 dp (#285)', async () => {
	await page.goto('/pages');
	await page.getByRole('button', { name: 'New database' }).click();
	await expect(page).toHaveURL(/\/pages\/pg_/);
	const db = page.locator('section.dbv').first();
	await expect(db).toBeVisible();
	await db.getByRole('button', { name: 'New record', exact: true }).click();
	await db.getByRole('button', { name: '+ Filter' }).click();
	await expectTargets48(page);
});

test('graph list links are 48 dp (#285)', async () => {
	const info = test.info();
	test.skip(info.project.name !== 'phone', 'landscape opens the canvas, not the list');
	await page.goto('/pages/graph');
	await expect(page.getByRole('list', { name: 'Pages and their links' })).toBeVisible();
	await expectTargets48(page);
});
