// Keyboard (#118): the page shrinks with the keyboard (interactive-widget=resizes-content); the field you type in
// and the sheet's main button stay on screen. Emulated by shrinking the viewport; a real keyboard needs a phone.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { bottomBar, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const KB = 520; // 915 px screen minus a ~395 px keyboard

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());
test.beforeEach(async () => {
	await page.setViewportSize({ width: 412, height: 915 });
});

async function onScreen(el: Locator) {
	const b = (await el.boundingBox())!;
	expect(b.y).toBeGreaterThanOrEqual(0);
	expect(b.y + b.height).toBeLessThanOrEqual(KB + 1);
}

test('viewport asks the browser to shrink the page for the keyboard', async () => {
	await page.goto('/today');
	await expect(page.locator('meta[name=viewport]')).toHaveAttribute(
		'content',
		/interactive-widget=resizes-content/,
	);
});

test('Add sheet: field and Add stay above the keyboard', async () => {
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add' });
	await page.keyboard.type('gym tmr 6pm');
	await page.setViewportSize({ width: 412, height: KB });
	await page.waitForTimeout(300);
	await onScreen(sheet.getByRole('combobox', { name: 'What and when' }));
	await onScreen(sheet.getByRole('button', { name: 'Add', exact: true }));
	await page.goBack();
});

test('Keep note: the note fits above the keyboard', async () => {
	await page.evaluate(
		() =>
		fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Keyboard note', body: 'a\nb\nc' }) }), // prettier-ignore
	);
	await page.goto('/keep');
	await page.getByText('Keyboard note').first().click();
	const note = page.getByRole('dialog');
	await expect(note).toBeVisible();
	await page.setViewportSize({ width: 412, height: KB });
	await page.waitForTimeout(300);
	await onScreen(note);
	await page.goBack();
});

test('Pages: "/" menu and link picker stay above the keyboard (#282)', async () => {
	const post = (title: string) =>
		page.evaluate(async (t) => {
			const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t }) }); // prettier-ignore
			return ((await r.json()) as { page: { id: string } }).page.id;
		}, title);
	const id = await post('Keyboard page');
	for (const n of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']) await post(`Kb ${n}`);
	await page.goto(`/pages/${id}`);
	await page.getByLabel('Page content').click();
	await page.setViewportSize({ width: 412, height: KB });
	await page.waitForTimeout(300);
	await page.keyboard.type('/');
	const menu = page.getByRole('listbox', { name: 'Insert block' });
	await expect(menu).toBeVisible();
	await onScreen(menu);
	await menu.getByRole('option', { name: /Link to page/ }).click();
	// PR 19: the slash item types "[[" and opens the same mention picker (BottomSheet on phone)
	const picker = page.getByRole('dialog', { name: 'Link a page' });
	await expect(picker.getByRole('option').first()).toBeVisible();
	await onScreen(picker);
});

test('Add sheet: Back closes the "/" menu first, then the sheet (#282)', async () => {
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add' });
	const field = sheet.getByRole('combobox', { name: 'What and when' });
	await field.focus();
	await page.keyboard.type('/');
	await expect(page.getByRole('option').first()).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('option')).toHaveCount(0);
	await expect(sheet).toBeVisible();
	await expect(field).toHaveValue('/');
	await page.goBack();
	await expect(sheet).toBeHidden();
});
