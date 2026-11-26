// Card 03 C5/C6/C12/C15 on phone: the shared reschedule list in the Today row ⋯ sheet and in the item sheet,
// 48 dp rows, Back closes the sheet, and a postponed occurrence's Undo closes the item sheet (D-V4-16).
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const DAY = '2035-03-05';
const LIST = ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…'];

/** JSON fetch as the page's user */
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
const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return r.j.item.id as string;
};
const drop = (page: Page, id: string) => api(page, 'DELETE', `/api/items/${id}`);
const seriesDates = async (page: Page, id: string) =>
	(await api(page, 'GET', '/api/calendar?from=2035-03-01&to=2035-04-01')).j.items
		.filter((i: { seriesId?: string }) => i.seriesId === id)
		.map((i: { date: string }) => i.date);
/** owner-local tomorrow, the same clock the app uses (Asia/Kuala_Lumpur project timezone) */
const tomorrow = (page: Page) =>
	page.evaluate(() => {
		const d = new Date(Date.now() + 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	});

test('C12 the Today row ⋯ sheet carries the same list (Skip on a repeating occurrence); Back closes it first', async ({
	page,
}) => {
	await signIn(page);
	const plain = `C12 plain ${RUN}`;
	const series = `C12 series ${RUN}`;
	const plainId = await mkItem(page, { title: plain, date: DAY, time: '10:00' });
	const seriesId = await mkItem(page, {
		title: series,
		date: DAY,
		time: '11:00',
		rrule: 'FREQ=DAILY;COUNT=3',
	});
	try {
		await page.goto(`/today?d=${DAY}`);
		const row = page.locator('.ent', { hasText: plain });
		await row.getByRole('button', { name: `Actions for ${plain}` }).click();
		const sheet = page.getByRole('dialog', { name: `Actions for ${plain}` });
		await expect(sheet).toBeVisible();
		expect(await sheet.locator('.act').allInnerTexts()).toEqual(['Done', 'Move…', ...LIST, 'Delete']);
		await expectTargets48(page);
		await noDesktopHints(page);
		await page.goBack(); // Back closes the sheet, not the page
		await expect(sheet).toBeHidden();
		await expect(page).toHaveURL(new RegExp(`/today\\?d=${DAY}`));

		const row2 = page.locator('.ent', { hasText: series });
		await row2.getByRole('button', { name: `Actions for ${series}` }).click();
		const sheet2 = page.getByRole('dialog', { name: `Actions for ${series}` });
		expect(await sheet2.locator('.act').allInnerTexts()).toEqual([
			'Done',
			'Move…',
			...LIST,
			'Skip this one',
			'Delete',
		]);
		// C8/C9 by tap on the row sheet: Skip removes this one date; Undo brings it back
		await sheet2.getByRole('button', { name: 'Skip this one' }).click();
		await expect(row2).toHaveCount(0);
		await expect(page.locator('.toast')).toContainText('Skipped this one');
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(page.locator('.ent', { hasText: series })).toBeVisible();
	} finally {
		await drop(page, plainId);
		await drop(page, seriesId);
	}
});

test('C12/C15 Tomorrow in the Today sheet moves the row off the day and Undo brings it back', async ({
	page,
}) => {
	await signIn(page);
	const title = `C12 move ${RUN}`;
	const id = await mkItem(page, { title, date: DAY, time: '10:00' });
	const day = await tomorrow(page);
	try {
		await page.goto(`/today?d=${DAY}`);
		const row = page.locator('.ent', { hasText: title });
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: `Actions for ${title}` }).click();
		await page
			.getByRole('dialog', { name: `Actions for ${title}` })
			.getByRole('button', { name: 'Tomorrow', exact: true })
			.click();
		await expect(page.locator('.toast')).toContainText('Moved');
		await expect(row).toHaveCount(0);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe(day);
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(page.locator('.ent', { hasText: title })).toBeVisible();
	} finally {
		await drop(page, id);
	}
});

test('C5 Ctrl+Z after a postpone that detached the shown occurrence closes the item sheet', async ({
	page,
}) => {
	await signIn(page);
	const title = `C5 undo key ${RUN}`;
	const id = await mkItem(page, { title, date: DAY, time: '12:00', rrule: 'FREQ=DAILY;COUNT=3' });
	try {
		await page.goto(`/today?d=${DAY}`);
		await page.locator('.ent .t', { hasText: title }).click();
		const sheet = page.getByRole('dialog', { name: 'Item' });
		await expect(sheet).toBeVisible();
		await sheet.getByRole('button', { name: /Postpone/ }).click();
		await sheet
			.getByRole('group', { name: 'Postpone' })
			.getByRole('button', { name: 'Tomorrow', exact: true })
			.click();
		await expect(page).not.toHaveURL(/%40|@/); // detached into its own row
		await page.keyboard.press('Control+z');
		await expect(sheet).toBeHidden();
		expect(await seriesDates(page, id)).toEqual([DAY, '2035-03-06', '2035-03-07']);
	} finally {
		await drop(page, id);
	}
});

test('C12 the item sheet has the list on phone; C5/C6 a postponed occurrence follows the new row, Undo closes the sheet', async ({
	page,
}) => {
	await signIn(page);
	const title = `C12 sheet ${RUN}`;
	const id = await mkItem(page, { title, date: DAY, time: '10:00', rrule: 'FREQ=DAILY;COUNT=3' });
	const day = await tomorrow(page);
	try {
		await page.goto(`/today?d=${DAY}`);
		await page.locator('.ent .t', { hasText: title }).click();
		const sheet = page.getByRole('dialog', { name: 'Item' });
		await expect(sheet).toBeVisible();
		await sheet.getByRole('button', { name: /Postpone/ }).click();
		const list = sheet.getByRole('group', { name: 'Postpone' });
		await expect(list).toBeVisible();
		expect(await list.getByRole('button').allInnerTexts()).toEqual([...LIST, 'Skip this one']);
		for (const b of await list.getByRole('button').all()) {
			const box = await b.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(48); // C12: 48 dp rows
		}
		await noDesktopHints(page);

		await list.getByRole('button', { name: 'Tomorrow', exact: true }).click();
		// C6: no scope dialog; the sheet follows the detached row
		await expect(sheet.getByLabel('Date', { exact: true })).toHaveValue(day);
		// C5 / D-V4-16: Undo deleted the row the sheet shows -> the sheet closes
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(sheet).toBeHidden();
		expect(await seriesDates(page, id)).toEqual([DAY, '2035-03-06', '2035-03-07']);
	} finally {
		await drop(page, id);
	}
});
