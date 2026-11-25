// v3.2 PR 4: the Slipped strip on Today — swipe right = done with Undo, tap opens the item, Move all to today
// works by tap and Undo puts the dates back.
import { expect, test, type Page } from '@playwright/test';
import { signIn, swipe } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let P = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	P = info.project.name;
});
test.afterAll(() => page.context().close());

const create = (body: object) =>
	page.evaluate(async (b) => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(b),
		});
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, body);
const item = (id: string) =>
	page.evaluate(
		async (i) =>
			((await (await fetch(`/api/items/${i}`)).json()) as { item: { date: string; status: string } }).item,
		id,
	);
const today = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()));
const plusDay = (d: string, n: number) =>
	new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const strip = () => page.getByRole('region', { name: 'Slipped items' });

test('strip row: swipe right = done with Undo, tap opens the item sheet', async () => {
	const T = `Slipped swipe ${P}`;
	const d = plusDay(await today(), -2);
	const id = await create({ title: T, date: d, time: '09:00' });
	await page.goto('/today');
	const row = strip().locator('li.rw', { hasText: T });
	await expect(row).toBeVisible();
	await swipe(page, row, 'right');
	await expect(page.locator('.toast')).toContainText('Done');
	await expect.poll(async () => (await item(id)).status).toBe('done');
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await item(id)).status).toBe('todo');
	// tap (the ⋯ sheet's path for the same row is in the reschedule spec)
	await row.getByRole('button', { name: T, exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Item' })).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('dialog', { name: 'Item' })).toBeHidden();
	await expect(page).toHaveURL(/\/today/);
});

test('Move all to today moves every slipped row; one Undo puts them back', async () => {
	const t = await today();
	const d1 = plusDay(t, -3);
	const d2 = plusDay(t, -4);
	const T = `Slipped bulk ${P}`;
	const a = await create({ title: `${T} A`, date: d1, time: '08:00' });
	const b = await create({ title: `${T} B`, date: d2 });
	await page.goto('/today');
	const btn = strip().getByRole('button', { name: 'Move all to today' });
	const box = await btn.boundingBox();
	expect(box!.height).toBeGreaterThanOrEqual(48); // phone hit size
	await btn.click();
	await expect(page.locator('.toast')).toContainText('Moved');
	await expect.poll(async () => (await item(a)).date).toBe(t);
	await expect.poll(async () => (await item(b)).date).toBe(t);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await item(a)).date).toBe(d1);
	await expect.poll(async () => (await item(b)).date).toBe(d2);
});
