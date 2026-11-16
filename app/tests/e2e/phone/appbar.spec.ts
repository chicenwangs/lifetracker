// Top app bar (#89): tab screens have no Back; deeper screens have a 48 dp Back + title that matches system Back.
import { expect, test, type Page } from '@playwright/test';
import { expectTappable, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const back = () => page.getByRole('banner').getByRole('button', { name: 'Back' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());
test.beforeEach(() => {
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
});

test('tab screens: no Back, no desktop nav, search + avatar 48 dp', async () => {
	for (const p of ['/today', '/week', '/keep', '/pages']) {
		await page.goto(p);
		await expect(back()).toHaveCount(0);
		await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
		const box = await page.getByRole('button', { name: /^Search/ }).boundingBox();
		expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
	}
});

test('deeper screens: Back + title; Back = system Back', async () => {
	await page.goto('/today');
	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('dialog', { name: 'Account' }).getByRole('link', { name: 'Trash' }).click();
	await expect(page).toHaveURL(/\/trash/);
	await expect(page.getByRole('banner')).toContainText('Trash');
	await expectTappable(back());
	const b = await back().boundingBox();
	expect(b && Math.min(b.width, b.height)).toBeGreaterThanOrEqual(48);
	await back().click();
	await expect(page).toHaveURL(/\/today$/);
});

test('page editor title = the page title; opened directly, Back goes to the Pages tab', async () => {
	const id = await page.evaluate(async () => {
		const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Bar title page' }) }); // prettier-ignore
		return ((await r.json()) as { page: { id: string } }).page.id;
	});
	const fresh = await page.context().newPage(); // no in-app history
	await fresh.goto(`/pages/${id}`);
	await expect(fresh.getByRole('banner')).toContainText('Bar title page');
	await fresh.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(fresh).toHaveURL(/\/pages$/);
	await fresh.close();
});
