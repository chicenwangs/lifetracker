// v3.2 PR 3: reschedule on the phone — the row ⋯ sheet stays open long enough to move the item (Undo puts it
// back), and the item sheet's Postpone ▾ can skip one occurrence of a repeat.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

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
		async (i) => ((await (await fetch(`/api/items/${i}`)).json()) as { item: { date: string } }).item,
		id,
	);
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

test('row ⋯ → Tomorrow moves the item, Undo moves it back', async () => {
	const T = `Resched row ${P}`;
	const d = await page.evaluate(() =>
		new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()),
	);
	const id = await create({ title: T, date: d, time: '08:00' });
	await page.goto(`/today?d=${d}`);
	await page.getByRole('button', { name: `Actions for ${T}` }).click();
	const sheet = page.getByRole('dialog', { name: `Actions for ${T}` });
	for (const label of ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…'])
		await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Tomorrow', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('Moved');
	const tomorrow = new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
	await expect.poll(async () => (await item(id)).date).toBe(tomorrow);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await item(id)).date).toBe(d);
});

test('item sheet Postpone ▾ → Skip this one drops the date; Undo brings it back', async () => {
	const T = `Resched skip ${P}`;
	const base = await create({
		title: T,
		date: '2030-09-01',
		time: '10:00',
		rrule: 'FREQ=DAILY;COUNT=5',
	});
	await page.goto('/today?d=2030-09-01');
	await page.getByRole('group', { name: T }).getByRole('button', { name: T, exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Postpone' }).click();
	const menu = page.getByRole('dialog', { name: /Postpone/ });
	await menu.getByRole('button', { name: 'Skip this one' }).click();
	await expect(page.locator('.toast')).toContainText('Skipped');
	await expect.poll(() => onCalendar(`${base}@2030-09-01`, '2030-09-01')).toBe(false);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => onCalendar(`${base}@2030-09-01`, '2030-09-01')).toBe(true);
});
