// v3.3 PR 11 (phone): the Import page's calendar file flow is 48 dp, previews, imports and undoes.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, signIn } from './helpers';

const ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'BEGIN:VEVENT',
	'UID:e2e-phone-import-1@lifetracker',
	'SUMMARY:Phone imported class',
	'DTSTART:20300502T020000Z',
	'DTEND:20300502T030000Z',
	'END:VEVENT',
	'END:VCALENDAR',
	'',
].join('\r\n');

const found = (page: Page) =>
	page.evaluate(async () => {
		const j = (await (await fetch('/api/search?q=Phone%20imported%20class')).json()) as {
			items: { id: string }[];
		};
		return j.items;
	});

test.describe.configure({ mode: 'serial' });
let page: Page;
test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(async () => {
	await page
		.evaluate(async () => {
			for (const i of (await (await fetch('/api/search?q=Phone%20imported%20class')).json()).items as {
				id: string;
			}[])
				await fetch('/api/items/' + i.id, { method: 'DELETE' });
		})
		.catch(() => {});
	await page.context().close();
});

test('calendar file: 48 dp, preview, import, Undo', async () => {
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'phone.ics',
		mimeType: 'text/calendar',
		buffer: Buffer.from(ICS),
	});
	await expectTargets48(page);
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.locator('.summary')).toContainText('1 event · 0 repeating · 0 skipped');
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 1 event');
	await expect.poll(async () => (await found(page)).length).toBe(1);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await found(page)).length).toBe(0);
});
