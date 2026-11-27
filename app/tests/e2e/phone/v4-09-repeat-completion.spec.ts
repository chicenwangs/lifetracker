// Card 09 C11 on phone: the two "Next one counts from" radios are 48 dp rows in the item sheet, the
// summary line wraps without horizontal scrolling, the sheet stays open while the value is saved, no
// desktop wording, and Back closes the sheet first.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const DAY = '2035-03-05';

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

test('C11 the radios are 48 dp rows; the sheet stays open; Back closes it first', async ({ page }) => {
	await signIn(page);
	const title = `Plants ${RUN}`;
	const id = await mkItem(page, { title, date: DAY, time: '10:00', rrule: 'FREQ=DAILY;INTERVAL=3' });
	expect((await api(page, 'PATCH', `/api/items/${id}`, { repeatFromCompletion: true })).s).toBe(200);
	const sheet = page.getByRole('dialog', { name: 'Item' });
	const summary = sheet.locator('.rfc-sum');
	try {
		await page.goto(`/today?d=${DAY}`);
		await page.locator('.ent .t', { hasText: title }).click();
		await expect(sheet).toBeVisible();

		// C1: the row and the summary are in the phone item sheet
		await expect(sheet.getByRole('radiogroup', { name: 'Next one counts from' })).toBeVisible();
		await expect(sheet.getByLabel('Scheduled date')).not.toBeChecked();
		await expect(sheet.getByLabel('When I finish it')).toBeChecked();
		await expect(summary).toHaveText('Every 3 days, counted from when you finish');

		// C11: a label hit area >= 48 dp on both radios
		for (const name of ['Scheduled date', 'When I finish it']) {
			const box = await sheet.locator('label.opt', { hasText: name }).boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
		}
		await expectTargets48(page);
		await noDesktopHints(page);

		// C11: the summary wraps inside the sheet — no horizontal scrolling
		const noHScroll = await sheet.locator('.body').evaluate((n) => n.scrollWidth <= n.clientWidth + 1);
		expect(noHScroll).toBe(true);

		// switching keeps the sheet open, like the other repeat fields
		await sheet.getByLabel('Scheduled date').check();
		await expect(page.locator('.toast')).toContainText('Saved');
		await expect(sheet).toBeVisible();
		await expect(summary).toHaveCount(0);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.repeatFromCompletion).toBeFalsy();
		await sheet.getByLabel('When I finish it').check();
		await expect(summary).toHaveText('Every 3 days, counted from when you finish');
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.repeatFromCompletion).toBe(true);

		// C11: Back closes the sheet, not the page
		await page.goBack();
		await expect(sheet).toBeHidden();
		await expect(page).toHaveURL(new RegExp(`/today\\?d=${DAY}`));
	} finally {
		await drop(page, id);
	}
});
