// v3.2 PR 4: the Slipped strip on Home — collapsible, one-off past items only, ⋯ = the reschedule list, and
// "Move all to today" as ONE undo batch.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './signin';

test.describe.configure({ mode: 'serial' });
let page: Page;

async function api(m: 'GET' | 'POST' | 'PATCH', p: string, b?: unknown) {
	return page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: (await r.json().catch(() => null)) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
		},
		[m, p, b] as const,
	);
}
const today = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()));
const plusDay = (d: string, n: number) =>
	new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dateOf = async (id: string) => (await api('GET', `/api/items/${id}`)).j.item.date as string;
const endOf = async (id: string) => (await api('GET', `/api/items/${id}`)).j.item.endDate as string;
const onCreate = async (body: object) => {
	const r = await api('POST', '/api/items', body);
	expect(r.s).toBe(201); // a 401/400 must fail here, not as a TypeError below
	return r.j.item.id as string;
};
const strip = () => page.getByRole('region', { name: 'Slipped items' });

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('strip: count, original date, collapsible, ⋯ = reschedule actions', async () => {
	const d1 = plusDay(await today(), -2);
	const d2 = plusDay(await today(), -3);
	await onCreate({ title: 'Slipped A', date: d1, time: '09:00' });
	await onCreate({ title: 'Slipped B', date: d2, endDate: plusDay(d2, 1) }); // a 2-day item that passed
	await onCreate({ title: 'Slipped today', date: await today() }); // not behind today: never slips
	await page.goto('/');
	await expect(strip()).toBeVisible();
	const row = strip().locator('li.rw', { hasText: 'Slipped A' });
	await expect(row).toContainText('Slipped A');
	await expect(row.locator('.od')).toHaveText(/^\w{3} \d{1,2} \w{3}$/); // "Mon 18 Nov"
	// the header counts what the list shows (the shared e2e DB may hold other past items), and today's
	// item is not one of them
	const rows = await strip().locator('li.rw').count();
	expect(rows).toBeGreaterThanOrEqual(2);
	await expect(strip().locator('.cap')).toContainText(`Slipped · ${rows}`);
	await expect(strip().getByText('Slipped today')).toHaveCount(0);
	// collapsible
	await strip().locator('.cap').click();
	await expect(strip().locator('li.rw')).toHaveCount(0);
	await strip().locator('.cap').click();
	await expect(row).toBeVisible();
	// ⋯ = the shared reschedule list (+ done/delete by tap)
	await page.getByRole('button', { name: 'Actions for Slipped A' }).click();
	const sheet = page.getByRole('dialog', { name: 'Slipped A' });
	for (const label of ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…', 'Done', 'Delete'])
		await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
	await page.goBack(); // Back closes the top layer (BottomSheet, #91)
	await expect(sheet).toBeHidden();
	await expect(strip()).toBeVisible();
});

test('Move all to today is one undo batch', async () => {
	const t = await today();
	const d1 = plusDay(t, -4);
	const d2 = plusDay(t, -5);
	const a = await onCreate({ title: 'Bulk A', date: d1, time: '08:00' });
	const b = await onCreate({ title: 'Bulk B', date: d2, endDate: plusDay(d2, 1) });
	await page.goto('/');
	await strip().getByRole('button', { name: 'Move all to today' }).click();
	await expect(page.locator('.toast')).toContainText('Moved');
	await expect.poll(() => dateOf(a)).toBe(t);
	await expect.poll(() => dateOf(b)).toBe(t);
	await expect.poll(() => endOf(b)).toBe(plusDay(t, 1)); // the 2-day span moved with it
	// one Undo puts every date back
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => dateOf(a)).toBe(d1);
	await expect.poll(() => dateOf(b)).toBe(d2);
});
