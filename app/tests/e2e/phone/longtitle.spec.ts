// A long unbroken title wraps inside its row: the ⋯ action stays on screen and the page never scrolls sideways (#289).
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const LONG = 'Q'.repeat(290);
const DAY = '2030-06-11';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	await page.evaluate(
		async ([title, date]) => {
			await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, date, time: '10:00' }) }); // prettier-ignore
		},
		[LONG, DAY],
	);
});
test.afterAll(() => page.context().close());

async function expectFits() {
	const more = page.getByRole('button', { name: /^Actions for Q+/ }).first();
	await expect(more).toBeVisible();
	const vw = page.viewportSize()!.width;
	const b = (await more.boundingBox())!;
	expect(b.x + b.width).toBeLessThanOrEqual(vw);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
}

test('Today: the ⋯ of a long unbroken title stays on screen', async () => {
	await page.goto(`/today?d=${DAY}`);
	await expectFits();
});

test('Month: the ⋯ of a long unbroken title stays on screen', async () => {
	await page.goto(`/month?m=2030-06&d=${DAY}`);
	await expectFits();
});
