// v3.3 PR 9: from-completion series on a phone: Slipped shows it, Done moves it +3 from today, Undo restores.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

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

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
const cleanup: string[] = [];
test.afterAll(async () => {
	for (const id of cleanup)
		await page.evaluate(async (i) => fetch(`/api/items/${i}`, { method: 'DELETE' }), id).catch(() => {});
	await page.context().close();
});

test('water plants every 3 days: overdue in Slipped, Done moves it +3, Undo puts it back', async () => {
	const t = await today();
	const T = `Water plants ${test.info().project.name}`;
	const made = await api('POST', '/api/items', {
		title: T,
		date: plusDay(t, -2),
		time: '09:00',
		rrule: 'FREQ=DAILY;INTERVAL=3',
	});
	expect(made.s).toBe(201);
	const id = made.j.item.id as string;
	cleanup.push(id);
	const flag = await api('PATCH', `/api/items/${id}`, { repeatFromCompletion: true });
	expect(flag.s).toBe(200);

	await page.goto('/today');
	const strip = page.getByRole('region', { name: 'Slipped items' });
	await expect(strip.getByRole('button', { name: T, exact: true })).toBeVisible();
	await expect(
		strip.getByRole('listitem').filter({ hasText: T }).getByLabel('Repeats from completion'),
	).toHaveCount(1);
	await page.getByRole('button', { name: `Actions for ${T}` }).click();
	await page
		.getByRole('dialog', { name: `Actions for ${T}` })
		.getByRole('button', { name: 'Done', exact: true })
		.click();
	await expect(page.locator('.toast')).toContainText('Done');
	await expect.poll(async () => (await api('GET', `/api/items/${id}`)).j.item.date).toBe(plusDay(t, 3));
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await api('GET', `/api/items/${id}`)).j.item.date).toBe(plusDay(t, -2));
});
