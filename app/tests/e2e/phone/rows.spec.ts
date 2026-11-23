// Row gestures (#96): swipe right = done, left = delete with Undo, hold + drag = move; ⋯ = the same by tap.
import { expect, test, type Page } from '@playwright/test';
import { finger, signIn, swipe } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let P = '';
const DAY = '2030-04-10'; // a Wednesday

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	P = info.project.name;
});
test.afterAll(() => page.context().close());

const make = (title: string, date = DAY, time = '08:00') =>
	page.evaluate(
		async ([t, d, tm]) => {
			const r = await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, date: d, time: tm }) }); // prettier-ignore
			return ((await r.json()) as { item: { id: string } }).item.id;
		},
		[title, date, time],
	);
const item = (id: string) =>
	page.evaluate(async (i) => ((await (await fetch(`/api/items/${i}`)).json()) as { item: { date: string; time: string; status: string } }).item, id); // prettier-ignore

test('Today: swipe right = done, swipe left = delete with Undo', async () => {
	const id = await make(`Row swipe ${P}`);
	await page.goto(`/today?d=${DAY}`);
	const row = page.getByRole('group', { name: `Row swipe ${P}`, exact: true });
	await swipe(page, row, 'right');
	await expect(page.locator('.toast')).toContainText('Done');
	await expect.poll(async () => (await item(id)).status).toBe('done');
	await swipe(page, row, 'left');
	await expect(page.locator('.toast')).toContainText('Deleted');
	await expect(row).toBeHidden();
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(row).toBeVisible();
});

test('Today: hold lifts the row; drag down 2 steps = 30 min later', async () => {
	const id = await make(`Row move ${P}`, DAY, '09:00');
	await page.goto(`/today?d=${DAY}`);
	const row = page.getByRole('group', { name: `Row move ${P}`, exact: true });
	await row.evaluate((n) => n.scrollIntoView({ block: 'center' }));
	const b = (await row.boundingBox())!;
	const x = b.x + 60;
	const y = b.y + b.height / 2;
	const f = await finger(page);
	await f.send('touchStart', x, y);
	await page.waitForTimeout(600);
	await expect(row).toHaveClass(/lt-lifted/);
	for (let i = 1; i <= 8; i++) await f.send('touchMove', x, y + i * 6);
	await expect(row).toContainText('09:30'); // live time while carrying
	await f.send('touchEnd');
	await f.done();
	await expect(page.locator('.toast')).toContainText('09:30');
	await expect.poll(async () => (await item(id)).time).toBe('09:30');
});

test('⋯ actions: Done, Move…, Delete by tap', async () => {
	await make(`Row menu ${P}`, DAY, '10:00');
	await page.goto(`/today?d=${DAY}`);
	await page.getByRole('button', { name: `Actions for Row menu ${P}` }).click();
	const sheet = page.getByRole('dialog', { name: `Actions for Row menu ${P}` });
	await expect(sheet.getByRole('button')).toContainText(['Done', 'Move…', 'Delete']);
	await sheet.getByRole('button', { name: 'Move…' }).click();
	await expect(page.getByRole('dialog', { name: 'Item' })).toBeVisible(); // the item sheet edits day + time
});

test('Week: hold a row and drop it on another day', async () => {
	const id = await make(`Row day ${P}`, DAY, '11:00');
	await page.goto('/week?w=2030-04-08');
	const row = page.locator('.rw', { hasText: `Row day ${P}` });
	await row.evaluate((n) => n.scrollIntoView({ block: 'center' }));
	const b = (await row.boundingBox())!;
	const target = (await page.locator('section[data-date="2030-04-11"]').boundingBox())!;
	const x = b.x + 40;
	const y = b.y + b.height / 2;
	const f = await finger(page);
	await f.send('touchStart', x, y);
	await page.waitForTimeout(600);
	const ty = target.y + Math.min(30, target.height / 2);
	for (let i = 1; i <= 10; i++) await f.send('touchMove', x, y + ((ty - y) * i) / 10);
	await f.send('touchEnd');
	await f.done();
	await expect.poll(async () => (await item(id)).date).toBe('2030-04-11');
});

// #324: ActionSheet closes (clearing the page's `acting`) before run() fires; run must not read the cleared value.
for (const [name, url] of [
	['Week', '/week?w=2030-04-08'],
	['Month', `/month?m=2030-04&d=${DAY}`],
] as const)
	test(`${name}: ⋯ → Done ticks the row and shows Undo (#324)`, async () => {
		const errors: string[] = [];
		const onErr = (e: Error) => errors.push(e.message);
		page.on('pageerror', onErr);
		const id = await make(`Row tick ${name} ${P}`, DAY, '12:00');
		await page.goto(url);
		await page.getByRole('button', { name: `Actions for Row tick ${name} ${P}` }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
		await expect.poll(async () => (await item(id)).status).toBe('done');
		await expect(page.locator('.toast').getByRole('button', { name: 'Undo' })).toBeVisible();
		page.off('pageerror', onErr);
		expect(errors).toEqual([]);
	});
