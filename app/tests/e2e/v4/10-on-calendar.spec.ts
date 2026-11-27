// Card 10 (O-1 items 2–3, D-V4-11, D-V4-28) on desktop: Settings › Types gets one "Month calendar" switch per
// type (on by default, saved at once, no Save button, not journalled); switching a type off hides only my own
// items on the Month grid and leaves Week, Today and the item page alone; no "+N hidden" hint appears.
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of PASSWORDS) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForURL((u) => !/^\/(login|setup)/.test(u.pathname), { timeout: 5000 }).catch(() => {});
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** JSON fetch as the page's user (same helper shape as flow.spec.ts) */
const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: await r.json().catch(() => null) };
		},
		[m, p, b] as const,
	);
interface TypeRow {
	id: string;
	key: string;
	name: string;
	onCalendar: boolean;
}
const types = async (page: Page) =>
	((await api(page, 'GET', '/api/item-types')).j as { types: TypeRow[] }).types;
const stored = async (page: Page, key: string) => (await types(page)).find((t) => t.key === key)?.onCalendar;
const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return r.j.item.id as string;
};
const drop = (page: Page, id: string) => api(page, 'DELETE', `/api/items/${id}`);

/** the shared e2e DB keeps what earlier specs wrote: start with the old behaviour (all types on the Month) */
async function reset(page: Page) {
	await api(page, 'PATCH', '/api/me/prefs', { hiddenTypes: [] });
	for (const t of await types(page))
		if (!t.onCalendar) await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: true });
}

/** owner-local date n days from now (Asia/Kuala_Lumpur project timezone) */
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);

test('C1/C2 every type row has a Month calendar switch, on by default, saved without a Save button', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	const list = await types(page);
	expect(list.every((t) => t.onCalendar === true)).toBe(true);

	// C1: PATCH takes a strict boolean beside the other fields and returns the stored row
	const work = list.find((t) => t.key === 'Work') as TypeRow;
	const off = await api(page, 'PATCH', `/api/item-types/${work.id}`, { onCalendar: false, name: work.name });
	expect(off.s).toBe(200);
	expect((off.j as { type: TypeRow }).type.onCalendar).toBe(false);
	expect((await api(page, 'PATCH', `/api/item-types/${work.id}`, { onCalendar: 'no' })).s).toBe(400);
	expect((await api(page, 'PATCH', `/api/item-types/${work.id}`, { onMonth: true })).s).toBe(400);
	await api(page, 'PATCH', `/api/item-types/${work.id}`, { onCalendar: true });

	await page.goto('/settings/types');
	await expect(page.getByRole('columnheader', { name: 'Month calendar' })).toBeVisible();
	await expect(page.getByText('Off = hidden on Month, still on Week, Today and reminders.')).toBeVisible();
	await expect(page.locator('tbody tr:not(.extra)')).toHaveCount(list.length);
	// header and body agree: Used sits before Month calendar, and the switch is the Month calendar column's cell
	const headAt = (s: string) =>
		page
			.locator(s)
			.first()
			.evaluate((n) => (n as HTMLTableCellElement).cellIndex);
	const firstRow = page.locator('tbody tr:not(.extra)').first();
	const cellAt = (s: string) =>
		firstRow
			.locator(s)
			.first()
			.evaluate((n) => (n as HTMLTableCellElement).cellIndex);
	expect(await cellAt('td.used')).toBe(await headAt('th.used'));
	expect(await cellAt('td:has([role="switch"])')).toBe(await headAt('th:nth-child(6)'));
	// the older two flags stay as normal columns on desktop (the stacked row is phone-only)
	await expect(page.getByRole('checkbox', { name: 'Work counts down' })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Share Work by default' })).toBeVisible();
	await expect(page.locator('tbody tr.extra').first()).toBeHidden();
	await expect(page.locator('tbody tr.extra')).toHaveCount(list.length); // present for phone, hidden here
	for (const t of list)
		await expect(page.getByRole('switch', { name: `Month calendar for ${t.name}` })).toBeChecked();
	await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0); // toggles save at once

	// C2: switch off, wait for the store, reload: the stored value shows and there is still no Save button
	await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
	await expect.poll(() => stored(page, 'Work')).toBe(false);
	await page.reload();
	await expect(page.getByRole('switch', { name: 'Month calendar for Work' })).not.toBeChecked();
	await expect(page.getByRole('switch', { name: 'Month calendar for Event' })).toBeChecked();
	expect(await page.getByRole('button', { name: /^Save/ }).count()).toBe(0);

	await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
	await expect.poll(() => stored(page, 'Work')).toBe(true);
	await page.reload();
	await expect(page.getByRole('switch', { name: 'Month calendar for Work' })).toBeChecked();
});

test('C3/C5/C7/C8/C10 switch off → my item leaves Month, stays on Week and Today; on → it returns', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	const stamp = Date.now().toString(36);
	const today = await day(page, 0);
	// a quiet day next month: earlier specs leave items on today and on the 10th of a later month
	const quiet = await page.evaluate(() => {
		const d = new Date(Date.now() + 35 * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-25`;
	});
	const qm = quiet.slice(0, 7);
	const qWork = await mkItem(page, { title: `Class ${stamp}`, type: 'Work', date: quiet });
	const qOther = await mkItem(page, { title: `Party ${stamp}`, type: 'Event', date: quiet });
	// timed: the Today page's timeline lists timed items only
	const todayItem = await mkItem(page, {
		title: `Today class ${stamp}`,
		type: 'Work',
		date: today,
		time: '09:00',
	});

	try {
		// C3: both chips on the Month grid as usual
		await page.goto(`/?m=${qm}&d=${quiet}`);
		await expect(page.locator('.lt-chip', { hasText: `Class ${stamp}` })).toBeVisible();
		await expect(page.locator('.lt-chip', { hasText: `Party ${stamp}` })).toBeVisible();

		await page.goto('/settings/types');
		await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
		await expect.poll(() => stored(page, 'Work')).toBe(false);
		await expect(page.locator('.toast')).toHaveCount(0); // C10: no undo toast, no journal entry

		// C3/C7: my Work chip is gone; the other type stays; the calendar says nothing about hidden rows
		await page.goto(`/?m=${qm}&d=${quiet}`);
		await expect(page.locator('.lt-chip', { hasText: `Class ${stamp}` })).toHaveCount(0);
		await expect(page.locator('.lt-chip', { hasText: `Party ${stamp}` })).toBeVisible();
		await expect(page.locator('section[aria-label="Calendar"]')).not.toContainText('hidden');

		// C5: Week, Today and the item page are unchanged (the phone markup is in the DOM but hidden on desktop)
		const onPage = (t: string) => page.getByText(t).filter({ visible: true });
		await page.goto('/week');
		await expect(onPage(`Today class ${stamp}`).first()).toBeVisible();
		await page.goto('/today');
		await expect(onPage(`Today class ${stamp}`).first()).toBeVisible();
		await page.goto(`/item/${todayItem}`);
		await expect(onPage(`Today class ${stamp}`).first()).toBeVisible();

		// C8: back on → it returns on Month
		await page.goto('/settings/types');
		await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
		await expect.poll(() => stored(page, 'Work')).toBe(true);
		await page.goto(`/?m=${qm}&d=${quiet}`);
		await expect(page.locator('.lt-chip', { hasText: `Class ${stamp}` })).toBeVisible();
		await expect(page.locator('.lt-chip', { hasText: `Party ${stamp}` })).toBeVisible();
	} finally {
		for (const id of [qWork, qOther, todayItem]) await drop(page, id);
		await reset(page);
	}
});

test('C11 a failed PATCH shows the page error and the switch returns to the stored value', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	await page.goto('/settings/types');
	const sw = page.getByRole('switch', { name: 'Month calendar for Work' });
	await expect(sw).toBeChecked();
	const match = (u: URL) => u.pathname.startsWith('/api/item-types/');
	await page.route(match, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 400,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'bad_request', message: 'Nope' } }),
				})
			: route.continue(),
	);
	try {
		await sw.click();
		await expect(page.getByRole('alert')).toContainText('Nope');
		await expect(sw).toBeChecked(); // invalidateAll brings the stored true back
		expect(await stored(page, 'Work')).toBe(true);
	} finally {
		await page.unroute(match);
	}
});
