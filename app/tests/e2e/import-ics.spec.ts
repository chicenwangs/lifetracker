// v3.3 PR 11: Calendar file (.ics) — upload, preview, import, Undo.
import { expect, test } from '@playwright/test';
import { signIn } from './signin';

const ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'PRODID:-//Life Tracker e2e//EN',
	'BEGIN:VEVENT',
	'UID:e2e-import-1@lifetracker',
	'SUMMARY:Imported stand-up',
	'DTSTART:20300401T010000Z',
	'DTEND:20300401T020000Z',
	'END:VEVENT',
	'END:VCALENDAR',
	'',
].join('\r\n');

const found = (page: import('@playwright/test').Page) =>
	page.evaluate(async () => {
		const j = (await (await fetch('/api/search?q=Imported%20stand-up')).json()) as {
			items: { id: string }[];
		};
		const out: { id: string; date: string | null; time: string | null }[] = [];
		for (const i of j.items) {
			const d = (await (await fetch('/api/items/' + i.id)).json()) as {
				item: { date: string | null; time: string | null };
			};
			out.push({ id: i.id, date: d.item.date, time: d.item.time });
		}
		return out;
	});
const cleanup = async (page: import('@playwright/test').Page) => {
	await page.evaluate(async () => {
		for (const i of (await (await fetch('/api/search?q=Imported%20stand-up')).json()).items as {
			id: string;
		}[]) {
			await fetch('/api/items/' + i.id, { method: 'DELETE' });
		}
	});
};

test('calendar file: preview counts, import, Undo takes the rows away', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'e2e.ics',
		mimeType: 'text/calendar',
		buffer: Buffer.from(ICS),
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	const summary = page.locator('.summary');
	await expect(summary).toContainText('1 event · 0 repeating · 0 skipped');
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 1 event');
	// 01:00Z = 09:00 in Kuala Lumpur
	await expect.poll(async () => (await found(page)).length).toBe(1);
	const row = (await found(page))[0];
	expect(row?.date).toBe('2030-04-01');
	expect(row?.time).toBe('09:00');
	// Undo from the toast (the required path)
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await found(page)).length).toBe(0);
});

test('a file over 1 MB is refused before the upload with a friendly message', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/import');
	const big = Buffer.from(
		[
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'BEGIN:VEVENT',
			'UID:e2e-big@lifetracker',
			'SUMMARY:Too big',
			'DTSTART:20300401T010000Z',
			`X-PAD:${'x'.repeat(1200 * 1024)}`,
			'END:VEVENT',
			'END:VCALENDAR',
			'',
		].join('\r\n'),
	);
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'big.ics',
		mimeType: 'text/calendar',
		buffer: big,
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByRole('alert')).toContainText('bigger than 1 MB');
	await expect(page.locator('.summary')).toHaveCount(0);
});

test('a 600 KB file reaches the action and imports (hooks cap + adapter body limit)', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/import');
	const pad = Array.from({ length: 600 }, (_, i) => `X-PAD${i}:${'x'.repeat(900)}`).join('\r\n');
	const big = Buffer.from(
		[
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'BEGIN:VEVENT',
			'UID:e2e-600k@lifetracker',
			'SUMMARY:Six hundred KB',
			'DTSTART:20300405T010000Z',
			pad,
			'END:VEVENT',
			'END:VCALENDAR',
			'',
		].join('\r\n'),
	);
	expect(big.length).toBeGreaterThan(512 * 1024);
	expect(big.length).toBeLessThan(1024 * 1024);
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'big.ics',
		mimeType: 'text/calendar',
		buffer: big,
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.locator('.summary')).toContainText('1 event · 0 repeating · 0 skipped');
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 1 event');
	const n = await page.evaluate(async () => {
		const j = (await (await fetch('/api/search?q=Six%20hundred%20KB')).json()) as { items: { id: string }[] };
		for (const i of j.items) await fetch('/api/items/' + i.id, { method: 'DELETE' });
		return j.items.length;
	});
	expect(n).toBe(1);
});

test('the imported event shows on the Week grid; a re-import updates instead of copying', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'e2e.ics',
		mimeType: 'text/calendar',
		buffer: Buffer.from(ICS),
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 1 event');
	const monday = await page.evaluate(() => {
		const d = new Date('2030-04-01T00:00:00Z');
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
		return d.toISOString().slice(0, 10);
	});
	await page.goto(`/week?w=${monday}`);
	await expect(page.locator('.fc').getByText('Imported stand-up').first()).toBeVisible();
	// the same file again: preview says it will be updated, and the count stays 1
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'e2e.ics',
		mimeType: 'text/calendar',
		buffer: Buffer.from(ICS),
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByText('Already imported: 1 will be updated.')).toBeVisible();
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('updated 1');
	expect((await found(page)).length).toBe(1);
	await cleanup(page);
});
