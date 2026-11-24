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
	await expect(page.locator('.toast')).toContainText('Saved'); // one toast slot: this save's toast first
	await page.getByLabel('End date').fill('2030-12-01');
	await page.getByLabel('End date').press('Tab');
	await expect(page.locator('.toast')).toContainText('on or after the start');
	expect(await rule()).toBe('FREQ=DAILY;UNTIL=2031-02-03');
});

test('Item sheet: tick and edit show an Undo snackbar; an offline tick waits to sync (#293)', async () => {
	const mk = (body: object) =>
		page.evaluate(async (b) => {
			const r = await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); // prettier-ignore
			return ((await r.json()) as { item: { id: string } }).item.id;
		}, body);
	const get = (id: string) =>
		page.evaluate(async (i) => {
			const r = await fetch(`/api/items/${i}`);
			return ((await r.json()) as { item: { status: string; private: boolean } }).item;
		}, id);
	const toast = page.locator('.toast');

	// tick one date of a repeating item, then Undo
	const rep = await mk({ title: `${T} tick`, date: '2031-05-05', rrule: 'FREQ=DAILY;COUNT=4' });
	await page.goto(`/item/${rep}@2031-05-05`);
	await page.locator('button.sq').first().click();
	await expect(toast).toContainText('Started');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect
		.poll(() =>
			page.evaluate(async (t) => {
				const r = await fetch('/api/calendar?from=2031-05-05&to=2031-05-06');
				const j = (await r.json()) as { items: { title: string; status: string }[] };
				return j.items.filter((x) => x.title === `${t} tick`).map((x) => x.status);
			}, T),
		)
		.toEqual(['todo']); // the detached row is gone again

	// edit a plain item, then Undo
	const one = await mk({ title: `${T} edit`, date: '2031-05-06' });
	await page.goto(`/item/${one}`);
	await page.getByLabel('Keep secret').check();
	await expect(toast).toContainText('Saved');
	expect((await get(one)).private).toBe(true);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await get(one)).private).toBe(false);

	// offline tick: queued, not an error
	await page.context().setOffline(true);
	await page.locator('button.sq').first().click();
	await expect(toast).toContainText('Waiting to sync');
	await expect(page.locator('button.sq').first()).toHaveAttribute('aria-label', /In progress/);
	await page.context().setOffline(false);
	await expect.poll(async () => (await get(one)).status).toBe('doing');
});

test('Item page: toast Undo after a tick of a repeating item stays on the item (#375)', async () => {
	const day = new Date().toLocaleDateString('en-CA');
	const title = `${T} toast undo`;
	const id = await page.evaluate(
		async ([t, d]) => {
			const r = await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, date: d, rrule: 'FREQ=DAILY;COUNT=5' }) }); // prettier-ignore
			return ((await r.json()) as { item: { id: string } }).item.id;
		},
		[title, day],
	);
	await page.goto(`/item/${id}@${day}`);
	const sq = page.locator('button.sq').first();
	await sq.click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Started');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('Not found')).toHaveCount(0);
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
});
