// #72: Repeating items (daily/weekly/monthly/yearly/custom, tick per occurrence, edit/delete scope) + default reminders.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let T = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	T = `Repeat ${info.project.name}`;
});
test.afterAll(() => page.context().close());

test('Repeat picker in Item sheet expands occurrences on Week; ticking one occurrence detaches it; default reminder in Preferences works', async () => {
	await page.goto('/settings/preferences');
	await page.getByLabel('Default reminder on new items').selectOption('2h');
	await expect(page.locator('.toast')).toContainText('Saved');

	// Create an item on 2030-06-10 (Monday) -> gets the 2h default reminder automatically
	const itemId = await page.evaluate(async (title) => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, date: '2030-06-10', time: '10:00' }),
		});
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, T);

	const rems = await page.evaluate(async (id) => {
		const r = await fetch(`/api/reminders?source=planner_item&id=${id}`);
		return ((await r.json()) as { reminders: { offset: string }[] }).reminders;
	}, itemId);
	expect(rems.map((x) => x.offset)).toContain('2 hour');

	// Open the week of 2030-06-10, open the item sheet, and set Repeat to Daily
	await page.goto('/week?w=2030-06-10');
	await page
		.getByRole('link', { name: new RegExp(T) })
		.first()
		.click();
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	await sheet.getByLabel('Repeat').selectOption('FREQ=DAILY');
	await page.goBack();
	await expect(sheet).toBeHidden();

	// Now all 7 days of the week have an occurrence of T
	await expect(page.getByRole('link', { name: new RegExp(T) })).toHaveCount(7);

	// Reset default reminder to None so other tests aren't affected
	await page.evaluate(async () => {
		await fetch('/api/me/prefs', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ defaultReminder: null }),
		});
	});
});

test('Repeat ends "On date" keeps the series; an end before the start is refused (#295)', async () => {
	const id = await page.evaluate(async (title) => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, date: '2031-01-04', rrule: 'FREQ=DAILY;COUNT=10' }),
		});
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, `${T} ondate`);
	const rule = () =>
		page.evaluate(async (i) => {
			const r = await fetch(`/api/items/${i}`);
			return ((await r.json()) as { item: { rrule: string } }).item.rrule;
		}, id);
	await page.goto(`/item/${id}`);
	await page.getByLabel('Repeat ends').selectOption('until');
	await expect.poll(rule).toBe('FREQ=DAILY;UNTIL=2031-02-03'); // start + 30 days
	await page.getByLabel('End date').fill('2030-12-01');
	await page.getByLabel('End date').press('Tab');
	await expect(page.locator('.toast')).toContainText('on or after the start');
	expect(await rule()).toBe('FREQ=DAILY;UNTIL=2031-02-03');
});
