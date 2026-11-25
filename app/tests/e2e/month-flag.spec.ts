// v3.3 PR 10: a type with "Month calendar" off is hidden on the Month grid only — Week and Today keep it, and the
// Settings switch has an undo.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './signin';

test.describe.configure({ mode: 'serial' });
let page: Page;
let day = '';
let itemId = '';
const T = 'Month flag item';

const patchFlag = (on: boolean) =>
	page.evaluate(async (onCalendar) => {
		const j = (await (await fetch('/api/item-types')).json()) as { types: { id: string; key: string }[] };
		const ev = j.types.find((t) => t.key === 'Event');
		return (await fetch(`/api/item-types/${ev!.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ onCalendar }),
		})).status; // prettier-ignore
	}, on);

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page);
	day = await page.evaluate(() =>
		new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()),
	);
	itemId = await page.evaluate(async (d) => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Month flag item', date: d, time: '10:00', type: 'Event' }), // prettier-ignore
		});
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, day);
});
test.afterAll(async () => {
	await page
		.evaluate(async (id) => {
			await fetch(`/api/items/${id}`, { method: 'DELETE' });
		}, itemId)
		.catch(() => {});
	await patchFlag(true).catch(() => {});
	await page.context().close();
});

test('shown on Month, Week and Today by default', async () => {
	await page.goto('/');
	await expect(page.locator('.fc').getByText(T).first()).toBeVisible();
	await page.goto('/week');
	await expect(page.locator('.fc').getByText(T).first()).toBeVisible();
	await page.goto(`/today?d=${day}`);
	await expect(page.getByText(T).first()).toBeVisible();
});

test('Settings › Types: the Month calendar switch toggles and Undo puts it back', async () => {
	await page.goto('/settings/types');
	const cb = page.getByRole('checkbox', { name: 'Show Event on the Month calendar' });
	await expect(cb).toBeChecked();
	await cb.uncheck();
	await expect(page.locator('.toast')).toContainText('Month calendar off for Event');
	await expect(cb).not.toBeChecked();
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(cb).toBeChecked();
});

test('type off: gone from Month, still on Week and Today', async () => {
	expect(await patchFlag(false)).toBe(200);
	await page.goto('/');
	await expect(page.locator('.fc').getByText(T)).toHaveCount(0);
	await page.goto('/week');
	await expect(page.locator('.fc').getByText(T).first()).toBeVisible();
	await page.goto(`/today?d=${day}`);
	await expect(page.getByText(T).first()).toBeVisible();
});

test('type back on: the item returns to Month', async () => {
	expect(await patchFlag(true)).toBe(200);
	await page.goto('/');
	await expect(page.locator('.fc').getByText(T).first()).toBeVisible();
});
