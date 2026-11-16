// Instant tab switching (#90): a tab reopens where you left it, re-tap = top, no card fade-in on phone.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const tab = (name: string) => bottomBar(page).getByRole('link', { name });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	// enough notes to scroll Keep
	await page.evaluate(async () => {
		for (let i = 0; i < 24; i++)
			await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `Scroll note ${i}`, body: 'line\nline\nline' }) }); // prettier-ignore
	});
});
test.afterAll(() => page.context().close());
test.beforeEach(() => {
	test.fixme(test.info().project.name === 'phone-landscape', '#110: landscape still gets the desktop layout');
});

test('Calendar reopens on the week you left', async () => {
	await page.goto('/today');
	await tab('Calendar').click();
	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page).toHaveURL(/\/week\?w=/);
	const week = page.url();
	await tab('Keep').click();
	await expect(page).toHaveURL(/\/keep/);
	await tab('Calendar').click();
	await expect(page).toHaveURL(week);
});

test('Keep keeps its scroll; re-tap the active tab = top', async () => {
	await tab('Keep').click();
	await expect(page.getByText('Scroll note 23')).toBeVisible();
	await page.evaluate(() => scrollTo(0, 600));
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
	await tab('Today').click();
	await expect(page).toHaveURL(/\/today/);
	const t0 = Date.now();
	await tab('Keep').click();
	await expect(page.getByText('Scroll note 0')).toBeAttached();
	console.log(`tab switch to content: ${Date.now() - t0} ms`);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
	await tab('Keep').click();
	await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5);
});

test('no card fade-in on phone', async () => {
	await page.goto('/today');
	const anim = await page
		.locator('main .card')
		.first()
		.evaluate((el) => getComputedStyle(el).animationName);
	expect(anim).toBe('none');
});
