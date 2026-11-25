// v3.2 PR 3: the reschedule action set on the item page — Postpone (Undo restores the date), a detached
// occurrence follows, and Skip writes an EXDATE (Undo removes it).
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
const PW = 'good pass phrase';
let page: Page;

async function signIn() {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		await page.fill('#u', 'jeremy');
		await page.fill('#p', PW);
		await page.click('button[type=submit]');
	}
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

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
const onCreate = async (body: object) => (await api('POST', '/api/items', body)).j.item.id as string;
/** is this occurrence on the calendar? */
const onCalendar = (occId: string, date: string) =>
	page.evaluate(
		async ([id, f]) => {
			const to = new Date(Date.parse(f) + 864e5).toISOString().slice(0, 10);
			const r = await fetch(`/api/calendar?from=${f}&to=${to}`);
			const j = (await r.json()) as { items: { id: string }[] };
			return j.items.some((i) => i.id === id);
		},
		[occId, date] as const,
	);

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn();
});
test.afterAll(() => page.context().close());

test('Postpone "Tomorrow" from the item page, then Undo puts the date back', async () => {
	const d = await today();
	const id = await onCreate({ title: 'Resched one', date: d, time: '09:00' });
	await page.goto(`/item/${id}`);
	await page.getByRole('button', { name: 'Postpone' }).click();
	const sheet = page.getByRole('dialog', { name: /Postpone/ });
	await expect(sheet.getByRole('button')).toContainText([
		'Today',
		'Tomorrow',
		'Next weekday',
		'+1 week',
		'Pick date…',
	]);
	await sheet.getByRole('button', { name: 'Tomorrow' }).click();
	await expect(page.locator('.toast')).toContainText('Moved');
	await expect.poll(() => dateOf(id)).toBe(plusDay(d, 1));
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => dateOf(id)).toBe(d);
});

test('postponing one occurrence detaches it and the page follows the new row', async () => {
	const base = await onCreate({
		title: 'Resched occurrence',
		date: '2030-08-01',
		time: '10:00',
		rrule: 'FREQ=DAILY;COUNT=5',
	});
	await page.goto(`/item/${base}@2030-08-01`);
	await page.getByRole('button', { name: 'Postpone' }).click();
	await page
		.getByRole('dialog', { name: /Postpone/ })
		.getByRole('button', { name: 'Tomorrow' })
		.click();
	await expect(page.locator('.toast')).toContainText('Moved');
	await expect(page).toHaveURL(new RegExp(`/item/(?!${base}@)`)); // a new row, not the occurrence URL
	// "Tomorrow" is the real tomorrow (owner-local), not item date + 1
	await expect(page.getByLabel('Date', { exact: true })).toHaveValue(plusDay(await today(), 1));
	const series = (await api('GET', `/api/items/${base}`)).j.item;
	expect(series.rrule).toBe('FREQ=DAILY;COUNT=5');
	// the occurrence moved off its date and the series got an EXDATE (the calendar no longer shows it)
	await expect.poll(() => onCalendar(`${base}@2030-08-01`, '2030-08-01')).toBe(false);
});

test('Skip this one drops the date from the repeat; Undo brings it back', async () => {
	const base = await onCreate({
		title: 'Resched skip',
		date: '2030-09-01',
		time: '10:00',
		rrule: 'FREQ=DAILY;COUNT=5',
	});
	await page.goto(`/item/${base}@2030-09-01`);
	await page.getByRole('button', { name: 'Postpone' }).click();
	const sheet = page.getByRole('dialog', { name: /Postpone/ });
	await sheet.getByRole('button', { name: 'Skip this one' }).click();
	await expect(page.locator('.toast')).toContainText('Skipped');
	await expect(page).toHaveURL(new RegExp(`/item/${base}$`)); // the occurrence is gone: the series stays
	await expect.poll(() => onCalendar(`${base}@2030-09-01`, '2030-09-01')).toBe(false);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => onCalendar(`${base}@2030-09-01`, '2030-09-01')).toBe(true);
});
