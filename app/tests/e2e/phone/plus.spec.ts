// Context-aware + (#93, G6): Today / Calendar add on the day on screen, Keep makes a note, Pages makes a page.
// One create button per screen.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, finger, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const plus = () => bottomBar(page).locator('button.add');

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('Today: + adds on the day you are looking at', async () => {
	await page.goto('/today?d=2030-01-15');
	await plus().click();
	const sheet = page.getByRole('dialog', { name: 'Add' });
	await page.keyboard.type('plus day test 6pm');
	await expect(sheet.locator('#qa-slots, .slots').first()).toContainText('15 Jan');
	await page.goBack();
});

test('Today: + really creates the item on the shown day (#290)', async () => {
	await page.goto('/today?d=2030-02-20');
	await plus().click();
	await page.keyboard.type('day290 probe /calendar');
	const res = page.waitForResponse((r) => r.url().endsWith('/api/quickadd') && r.status() === 201);
	await page.getByRole('dialog', { name: 'Add' }).getByRole('button', { name: 'Add', exact: true }).click();
	expect((await (await res).json()).item.date).toBe('2030-02-20');
	await page.goBack();
});

test('Add: an expired /remind is reported in the toast (#291)', async () => {
	await page.goto('/today?d=2019-01-01');
	await plus().click();
	await page.keyboard.type('remind291 probe 9am /calendar /remind 1d');
	await page.getByRole('dialog', { name: 'Add' }).getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('already passed');
	await page.goBack();
});

test('Add sheet: the "/" options are 48 dp (#229)', async () => {
	await page.goto('/today');
	await plus().click();
	await page.keyboard.type('x /');
	await expect(page.getByRole('option').first()).toBeVisible();
	for (const o of await page.getByRole('option').all())
		await expect.poll(async () => (await o.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48); // after the sheet's intro
	await page.goBack();
});

test("Calendar on another week: + adds on that week's first day", async () => {
	await page.goto('/week?w=2030-01-14');
	await plus().click();
	await page.keyboard.type('plus week test 6pm');
	await expect(page.getByRole('dialog', { name: 'Add' }).locator('#qa-slots, .slots').first()).toContainText(
		'14 Jan',
	);
	await page.goBack();
});

test('Month: + adds on the selected day on screen (#399)', async () => {
	await page.goto('/month?m=2030-01&d=2030-01-15');
	await plus().click();
	await page.keyboard.type('month399 probe 6pm');
	await expect(page.getByRole('dialog', { name: 'Add' }).locator('#qa-slots, .slots').first()).toContainText(
		'15 Jan',
	);
	const res = page.waitForResponse((r) => r.url().endsWith('/api/quickadd') && r.status() === 201);
	await page.getByRole('dialog', { name: 'Add' }).getByRole('button', { name: 'Add', exact: true }).click();
	const j = await (await res).json();
	expect(j.block.startAt.slice(0, 10)).toBe('2030-01-15');
	await page.goBack();
});

test('Keep: + makes a note; no second New note button', async () => {
	await page.goto('/keep');
	await expect(page.getByRole('button', { name: 'New note', exact: true })).toHaveCount(1); // the bar's +
	await plus().click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.goBack();
});

test('Pages: + makes a page and opens it; no second New page button', async () => {
	await page.goto('/pages');
	await expect(page.getByRole('button', { name: 'New page', exact: true })).toHaveCount(1); // the bar's +
	await plus().click();
	await expect(page).toHaveURL(/\/pages\/pg_/);
});

test('Quick note has no mic on the web (voice note is app only, PR 13)', async () => {
	await page.goto('/today');
	await plus().click();
	await page.getByRole('tab', { name: 'Quick note' }).click();
	await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dictate note' })).toHaveCount(0);
});

test('rapid taps after Save note do not reach the page beneath (#378)', async () => {
	await page.goto('/today');
	// a warning toast from an earlier test can still sit over the Save spot (8 s), so let it clear first
	await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10_000 });
	await plus().click();
	await page.getByRole('tab', { name: 'Quick note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(`Save guard ${test.info().project.name}`);
	const save = page.getByRole('button', { name: 'Save note' });
	const b = (await save.boundingBox())!;
	const x = b.x + b.width / 2;
	const y = b.y + b.height / 2;
	const f = await finger(page);
	await f.send('touchStart', x, y);
	await f.send('touchEnd');
	// the rest of the burst must land on the guard, not the Today row that just appeared under the finger
	await expect(page.locator('.tap-guard')).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('tap-guard'), [
				x,
				y,
			] as const),
		)
		.toBe(true);
	await f.send('touchStart', x, y);
	await f.send('touchEnd');
	await page.waitForTimeout(60);
	await f.send('touchStart', x, y);
	await f.send('touchEnd');
	await f.done();
	await expect(page.locator('.toast')).toContainText('Note saved');
	await expect(page.getByRole('dialog', { name: /^Actions for/ })).toHaveCount(0);
	await expect(page.locator('.toast').filter({ hasText: 'Deleted' })).toHaveCount(0);
	await page.waitForTimeout(500);
	await expect(page.locator('.tap-guard')).toHaveCount(0); // the guard removes itself
});
