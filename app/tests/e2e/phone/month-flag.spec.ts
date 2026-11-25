// v3.3 PR 10 (phone): a type with "Month calendar" off is hidden on the phone Month (grid count + agenda), still on
// Week and Today; the Settings › Types switch has an undo.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let day = '';
let week = '';
let itemId = '';
const T = 'Month flag phone';

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

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	day = await page.evaluate(() =>
		new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()),
	);
	const monday = new Date(day + 'T00:00:00Z');
	monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
	week = monday.toISOString().slice(0, 10);
	itemId = await page.evaluate(async (d) => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Month flag phone', date: d, time: '10:00', type: 'Event' }), // prettier-ignore
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

test('default: the Event item is in the phone Month agenda', async () => {
	await page.goto(`/month?m=${day.slice(0, 7)}&d=${day}`);
	await expect(page.getByRole('region', { name: /Agenda for/ }).getByText(T)).toBeVisible();
});

test('Settings › Types: the Month calendar switch has an Undo', async () => {
	await page.goto('/settings/types');
	const cb = page.getByRole('checkbox', { name: 'Show Event on the Month calendar' });
	await expect(cb).toBeChecked();
	await cb.uncheck();
	await expect(page.locator('.toast')).toContainText('Month calendar off for Event');
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(cb).toBeChecked();
});

test('type off: gone from Month, still on Week and Today', async () => {
	expect(await patchFlag(false)).toBe(200);
	await page.goto(`/month?m=${day.slice(0, 7)}&d=${day}`);
	await expect(page.getByRole('region', { name: /Agenda for/ }).getByText(T)).toHaveCount(0);
	await page.goto(`/week?w=${week}`);
	await expect(page.getByRole('main', { name: 'Week agenda' }).getByText(T)).toBeVisible();
	await page.goto(`/today?d=${day}`);
	await expect(page.getByText(T).first()).toBeVisible();
});

test('type back on: the item returns to the phone Month agenda', async () => {
	expect(await patchFlag(true)).toBe(200);
	await page.goto(`/month?m=${day.slice(0, 7)}&d=${day}`);
	await expect(page.getByRole('region', { name: /Agenda for/ }).getByText(T)).toBeVisible();
});
