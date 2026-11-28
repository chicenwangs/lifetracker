// Card 16 (D-V4-22, DESIGN §2.1 line 66, §2.2 line 71) on phone: the page ⋯ sheet row "Add icon" opens the
// shared BottomSheet picker (6 columns of 48 dp cells), Back closes it before the page, the icon shows at
// 44 px, and nothing reads out a desktop key hint while the picker is open.
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

const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
async function mkPage(title: string) {
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/pages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ parentId: null, title: t }),
		});
		return ((await r.json()) as { page: { id: string } }).page.id;
	}, title);
	await page.goto(`/pages/${id}`);
	return id;
}
const menu = () => page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' });
const sheet = () => page.getByRole('dialog', { name: 'Icon' });
const open = async () => {
	await menu().click();
	await page.getByRole('menuitem', { name: 'Add icon' }).click();
	await expect(sheet()).toBeVisible();
};

test('C1 the phone entry is the ⋯ sheet row, the desktop button is not shown, and the icon draws at 44 px', async () => {
	const title = `Phone icon ${stamp()}`;
	await mkPage(title);
	await expect(page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' })).toBeVisible();
	await expect(page.locator('.pagev .head .iconbtn')).toBeHidden(); // no button beside the title on phone
	await menu().click();
	await expect(page.getByRole('menuitem', { name: 'Add icon' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Add icon' }).click();
	await expect(sheet()).toBeVisible();
	await sheet().getByRole('button', { name: '📄', exact: true }).click();
	await expect(sheet()).toBeHidden();
	const icon = page.getByRole('img', { name: 'Page icon' });
	await expect(icon).toHaveText('📄');
	const size = await icon.evaluate((n) => getComputedStyle(n).fontSize);
	expect(size).toBe('44px');
	// and it survives a reload (the PATCH went through)
	await page.reload();
	await expect(page.getByRole('img', { name: 'Page icon' })).toHaveText('📄');
});

test('C6 the sheet has 6 columns of 48 dp cells, Back closes it before the page, no desktop hints', async () => {
	await mkPage(`Phone sheet ${stamp()}`);
	await open();
	const geo = await sheet().evaluate((n) => {
		const grid = n.querySelector('.grid')!;
		const cells = [...n.querySelectorAll<HTMLElement>('.cell')];
		const first = cells[0]!.getBoundingClientRect();
		return {
			n: cells.length,
			cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
			w: Math.round(first.width),
			h: Math.round(first.height),
		};
	});
	expect(geo).toEqual({ n: 40, cols: 6, w: 48, h: 48 });
	await expectTargets48(page);
	await noDesktopHints(page);
	// Back closes the picker and stays on the page
	const url = page.url();
	await page.goBack();
	await expect(sheet()).toBeHidden();
	expect(page.url()).toBe(url);
	await expect(page.getByLabel('Page title')).toBeVisible(); // still the page, not its parent
});

test('C3 Remove in the sheet sends null and the page shows no icon again, with the undo toast', async () => {
	await mkPage(`Phone remove ${stamp()}`);
	await open();
	await sheet().getByRole('button', { name: '🔥', exact: true }).click();
	await expect(page.getByRole('img', { name: 'Page icon' })).toHaveText('🔥');
	await open();
	await sheet().getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('img', { name: 'Page icon' })).toHaveCount(0);
	await expect(page.getByRole('status').filter({ hasText: 'Icon removed' })).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('img', { name: 'Page icon' })).toHaveText('🔥');
});
