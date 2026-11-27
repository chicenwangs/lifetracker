// Blind tests for card 09 on the phone projects, from its Done-when lines only: C11 (the two radios are 48 dp
// rows in the item sheet, the sheet stays open after a change, the summary wraps without sideways scrolling,
// Back closes the sheet first, no desktop hints). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import { HINTS, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file

let page: Page;

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		for (const pw of [RESET_PW, PW]) {
			await p.fill('#u', 'jeremy');
			await p.fill('#p', pw);
			await p.click('button[type=submit]');
			await p.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!p.url().includes('/login')) break;
		}
	}
	await expect(p).not.toHaveURL(/\/(setup|login)/);
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await setHints(p, HINTS);
}

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('C11 phone: the two radios are 48 dp sheet rows, the summary wraps, the sheet stays open, and Back closes it first without desktop hints', async () => {
	const title = `Blind09 phone ${Date.now()}`;
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: t, date: '2031-04-07', time: '09:00', rrule: 'FREQ=DAILY;INTERVAL=3' }), // prettier-ignore
		});
		const item = ((await r.json()) as { item: { id: string } }).item;
		await fetch(`/api/items/${item.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ repeatFromCompletion: true }),
		});
		return item.id;
	}, title);

	// open the shared item sheet from the phone Month agenda
	await page.goto('/month?m=2031-04&d=2031-04-07');
	await page.locator('.agenda button.row', { hasText: title }).click();
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/item/${id}`));
	await expect(sheet.getByRole('radiogroup', { name: 'Next one counts from' })).toBeVisible();
	await expect(sheet.getByRole('radio', { name: 'When I finish it' })).toBeChecked();

	// both radio rows carry a 48 dp label hit area
	for (const name of ['Scheduled date', 'When I finish it']) {
		const box = await sheet.locator('label.opt', { hasText: name }).boundingBox();
		expect(box, name).not.toBeNull();
		expect(Math.round(box!.height), name).toBeGreaterThanOrEqual(48);
		expect(Math.round(box!.width), name).toBeGreaterThanOrEqual(48);
	}

	// the summary line wraps inside the sheet; no sideways scrolling anywhere in it
	const summary = sheet.locator('.rfc-sum');
	await expect(summary).toHaveText('Every 3 days, counted from when you finish');
	expect(await summary.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
	expect(await sheet.locator('.body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
	await noDesktopHints(page);

	// changing the radios keeps the sheet open and is saved
	await sheet.getByRole('radio', { name: 'Scheduled date' }).check();
	await expect(page.locator('.toast')).toContainText('Saved');
	await expect(sheet).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(async (i) => {
				const r = await fetch(`/api/items/${i}`);
				return !!((await r.json()) as { item: { repeatFromCompletion?: boolean } }).item.repeatFromCompletion;
			}, id),
		)
		.toBe(false);

	await sheet.getByRole('radio', { name: 'When I finish it' }).check();
	await expect(sheet).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(async (i) => {
				const r = await fetch(`/api/items/${i}`);
				return !!((await r.json()) as { item: { repeatFromCompletion?: boolean } }).item.repeatFromCompletion;
			}, id),
		)
		.toBe(true);
	await noDesktopHints(page);

	// Back (system/browser, like the phone Back button) closes the sheet first and stays on Month
	await page.goBack();
	await expect(sheet).toBeHidden();
	await expect(page).toHaveURL(/\/month/);
	await noDesktopHints(page);

	// clean up
	await page.evaluate(async (i) => {
		await fetch(`/api/items/${i}`, { method: 'DELETE' });
	}, id);
});
