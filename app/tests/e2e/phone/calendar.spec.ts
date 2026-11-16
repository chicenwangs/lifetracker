// Calendar tab (#95): Week | Month switch, swipe periods, a month day's agenda stays in the tab, no PC wording.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, signIn, swipe } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const q = (k: string) => new URL(page.url()).searchParams.get(k);

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	await page.evaluate(
		(t) =>
		fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, date: '2030-02-12', time: '09:30' }) }), // prettier-ignore
		`Cal agenda ${test.info().project.name}`,
	);
});
test.afterAll(() => page.context().close());

test('Week: switch to Month, swipe for the next week, title without the year', async () => {
	await page.goto('/week?w=2030-02-11');
	await expect(page.locator('.pbar strong')).toHaveText('11 Feb – 17 Feb');
	await swipe(page, page.getByRole('group', { name: /The week/ }), 'left');
	await expect.poll(() => q('w')).toBe('2030-02-18');
	await page.getByRole('navigation', { name: 'Calendar view' }).getByRole('link', { name: 'Month' }).click();
	await expect(page).toHaveURL(/\/month\?m=2030-02/);
	await expect(bottomBar(page).getByRole('link', { name: 'Calendar' })).toHaveAttribute(
		'aria-current',
		'page',
	);
});

test('Month: tap a day = its agenda below, still in Calendar; tap the row = item sheet', async () => {
	await page.goto('/month?m=2030-02');
	await page.getByRole('link', { name: /12 Feb 2030/ }).click();
	await expect.poll(() => q('d')).toBe('2030-02-12');
	await expect(page).toHaveURL(/\/month/);
	const agenda = page.getByRole('region', { name: /Agenda for/ });
	const row = agenda.getByRole('button', { name: new RegExp(`Cal agenda ${test.info().project.name}`) });
	await expect(row).toContainText('09:30');
	await row.click();
	await expect(page.getByRole('dialog', { name: 'Item' })).toBeVisible();
	await page.goBack();
	await expect(page.getByText(/PC view/)).toHaveCount(0);
});

test('Month: swipe the grid for the next month', async () => {
	await page.goto('/month?m=2030-02');
	await swipe(page, page.getByRole('navigation', { name: /^Days/ }), 'left');
	await expect.poll(() => q('m')).toBe('2030-03');
});
