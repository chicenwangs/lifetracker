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
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
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
	await onScreen(sheet.getByRole('textbox', { name: 'What and when' }));
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
