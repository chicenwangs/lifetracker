// v3.3 PR 9: repeat from completion — radio + summary, one next date, done copy + Undo (desktop).
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
const dayItems = (d: string) =>
	page.evaluate(async (f) => {
		const to = new Date(Date.parse(f) + 864e5).toISOString().slice(0, 10);
		const r = await fetch(`/api/calendar?from=${f}&to=${to}`);
		return ((await r.json()) as { items: { id: string; title: string; date: string; status: string }[] })
			.items;
	}, d);

const cleanup: string[] = [];
test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page);
});
test.afterAll(async () => {
	for (const id of cleanup)
		await page.evaluate(async (i) => fetch(`/api/items/${i}`, { method: 'DELETE' }), id).catch(() => {});
	await page.context().close();
});

test('from completion: radio + summary, one row, done copy, Undo', async () => {
	const t = await today();
	const T = `Water plants ${Date.now() % 100000}`;
	const made = await api('POST', '/api/items', { title: T, date: t, time: '09:00', rrule: 'FREQ=DAILY' });
	expect(made.s).toBe(201);
	const id = made.j.item.id as string;
	cleanup.push(id);

	await page.goto(`/item/${id}`);
	await expect(page.getByRole('radiogroup', { name: 'Next one counts from' })).toBeVisible();
	await page.getByRole('radio', { name: 'When I finish it' }).check();
	await expect(page.getByText('Every day, counted from when you finish')).toBeVisible();
	await page.reload();
	await expect(page.getByRole('radio', { name: 'When I finish it' })).toBeChecked();

	// the row says why it has no future ghosts
	await page.goto('/today');
	await expect(page.getByLabel('Repeats from completion').first()).toBeVisible();

	// todo -> doing -> done. A doing tick must not detach the series. Scope to the item panel: the same
	// unstarted square also sits on the day planner while the item is on today.
	await page.goto(`/item/${id}`);
	const itemRegion = page.getByRole('region', { name: 'Item' });
	await itemRegion.getByRole('button', { name: 'Not started. Activate to start' }).click();
	await itemRegion.getByRole('button', { name: 'In progress. Activate to complete' }).click();
	await expect.poll(() => dateOf(id)).toBe(plusDay(t, 1));
	const copy = (await dayItems(t)).find((i) => i.title === T && i.status === 'done');
	expect(copy?.date).toBe(t);

	// one Undo removes the done copy and puts the series date back
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => dateOf(id)).toBe(t);
	expect((await dayItems(t)).some((i) => i.id === copy?.id)).toBe(false);
});
