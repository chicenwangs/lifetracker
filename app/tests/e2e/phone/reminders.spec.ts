// #112: reminder notifications get Done · Snooze 10 min · Tomorrow; tapping opens that item's sheet.
// Native Android alarm & notification drawer checked on a real phone; web + API + sheet path verified here.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('reminder tap route opens the item sheet over Today; Snooze 10 min, Tomorrow and Done work', async () => {
	await page.goto('/today');
	const { itemId, remId } = await page.evaluate(async () => {
		const due = new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 19) + 'Z';
		const ir = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Reminder sheet item', date: '2030-05-14', time: '10:00' }),
		});
		const itemId = ((await ir.json()) as { item: { id: string } }).item.id;
		const rr = await fetch('/api/reminders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ source: 'planner_item', sourceId: itemId, at: due }),
		});
		const remId = ((await rr.json()) as { reminder: { id: string } }).reminder.id;
		return { itemId, remId };
	});

	// /api/native exposes the sheet route and source metadata for the Android notification
	const nativeRem = await page.evaluate(async (id) => {
		const r = await fetch('/api/native');
		const j = (await r.json()) as {
			reminders: { id: string; route: string; sourceType: string; sourceId: string }[];
		};
		return j.reminders.find((x) => x.id === id);
	}, remId);
	expect(nativeRem).toMatchObject({
		id: remId,
		route: `/today?item=${itemId}`,
		sourceType: 'planner_item',
		sourceId: itemId,
	});

	// Tapping the notification opens /today?item=<id> -> opens that item's sheet over Today
	await page.goto(nativeRem!.route);
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText('Reminder sheet item');
	await page.goBack();
	await expect(sheet).toBeHidden();
	await expect(page).toHaveURL(/\/today$/);

	// Snooze 10 min reschedules ~10 min from now
	const snoozed = await page.evaluate(async (id) => {
		const r = await fetch(`/api/reminders/${id}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'snooze10' }),
		});
		return ((await r.json()) as { reminder: { dueAt: string; status: string } }).reminder;
	}, remId);
	expect(snoozed.status).toBe('scheduled');
	expect(Date.parse(snoozed.dueAt) - Date.now()).toBeGreaterThan(8 * 60_000);
	expect(Date.parse(snoozed.dueAt) - Date.now()).toBeLessThan(12 * 60_000);

	// Tomorrow reschedules to tomorrow morning (09:00 local)
	const tomorrow = await page.evaluate(async (id) => {
		const r = await fetch(`/api/reminders/${id}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'tomorrow' }),
		});
		return ((await r.json()) as { reminder: { dueAt: string; status: string } }).reminder;
	}, remId);
	expect(tomorrow.status).toBe('scheduled');
	expect(Date.parse(tomorrow.dueAt) - Date.now()).toBeGreaterThan(6 * 3600_000);

	// Done marks the item itself done
	await page.evaluate(async (id) => {
		await fetch(`/api/reminders/${id}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'done' }),
		});
	}, remId);
	const itemStatus = await page.evaluate(async (id) => {
		const r = await fetch(`/api/items/${id}`);
		return ((await r.json()) as { item: { status: string } }).item.status;
	}, itemId);
	expect(itemStatus).toBe('done');
});
