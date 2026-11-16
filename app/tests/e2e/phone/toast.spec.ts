// Undo toast on phone (#111): sits above the bottom bar, bar stays usable, 48 dp Undo, swipe sideways to dismiss.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, expectTappable, signIn, swipe } from './helpers';

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

async function deleteOne(title: string) {
	await page.evaluate(async (t) => {
		const d = new Date();
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, date, time: '06:00' }) }); // prettier-ignore
	}, title);
	await page.goto('/today');
	await swipe(page, page.getByRole('group', { name: title, exact: true }), 'left'); // #96: swipe left = delete
	const toast = page.locator('.toast');
	await expect(toast).toContainText(title);
	return toast;
}

test('toast sits above the bar; bar and Undo stay tappable', async () => {
	const toast = await deleteOne(`Toast item one ${test.info().project.name}`);
	const t = (await toast.boundingBox())!;
	const b = (await bottomBar(page).boundingBox())!;
	expect(t.y + t.height).toBeLessThanOrEqual(b.y);
	await expectTappable(bottomBar(page).getByRole('link'));
	await expectTappable(bottomBar(page).getByRole('button', { name: 'Add' }));
	const undo = toast.getByRole('button', { name: 'Undo' });
	await expectTappable(undo);
	const u = (await undo.boundingBox())!;
	expect(Math.min(u.width, u.height)).toBeGreaterThanOrEqual(48);
	await undo.click();
	await expect(
		page.getByRole('group', { name: `Toast item one ${test.info().project.name}`, exact: true }),
	).toBeVisible();
});

test('swipe the toast sideways to dismiss it', async () => {
	const toast = await deleteOne(`Toast item two ${test.info().project.name}`);
	await swipe(page, toast.locator('span').first(), 'right', 160);
	await expect(toast).toBeHidden();
});
