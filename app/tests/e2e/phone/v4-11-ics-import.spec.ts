// Card 11 (D-V4-29) on phone: the .ics preview is an inline panel (not the shared BottomSheet), every
// control is 48 dp, nothing scrolls sideways, the skipped reasons are readable, the offline state disables
// the input and Import, and an import lands on Today.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

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
const hits = async (page: Page, q: string) =>
	((await api(page, 'GET', `/api/search?q=${encodeURIComponent(q)}`)).j as { items: { id: string }[] }).items;

const day = (n: number) => {
	const d = new Date(Date.now() + n * 86_400_000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const compact = (date: string) => date.replace(/-/g, '');
const event = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const ics = (body: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR', ''].join('\r\n');
const file = (text: string, name = 'calendar.ics') => ({
	name,
	mimeType: 'text/calendar',
	buffer: Buffer.from(text),
});

test('C11/C12 phone inline preview: 48 dp, no sideways scroll, no desktop hints, offline, import to Today', async ({
	page,
	context,
}) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const title = `Phone ics ${stamp}`;
	await page.goto('/settings/import');
	const input = page.getByLabel('Calendar file (.ics)');
	await expect(page.getByRole('heading', { name: 'Calendar file (.ics)' })).toBeVisible();
	await input.setInputFiles(
		file(
			ics([
				...event([
					`UID:ics-phone-${stamp}`,
					`SUMMARY:${title}`,
					`DTSTART:${compact(day(0))}T090000`,
					`DTEND:${compact(day(0))}T100000`,
				]),
				...event([
					`UID:ics-phone-bad-${stamp}`,
					`SUMMARY:Lab rota`,
					`DTSTART:${compact(day(0))}T090000`,
					'RRULE:FREQ=YEARLY;BYWEEKNO=20',
				]),
			]),
		),
	);

	// C2/C11: the inline panel, its counts and its skipped reasons (not a dialog)
	await expect(page.locator('.big')).toContainText('1 event · 0 repeating · 1 skipped');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByText('Skipped (1)').click();
	await expect(page.locator('.skipped')).toContainText('"Lab rota" — repeats by week number, not supported');
	await expect(page.getByLabel('Put them in type')).toBeVisible();

	// C11: every control is 48 dp and nothing scrolls sideways
	await expectTargets48(page);
	const widths = await page.evaluate(() => {
		const panel = document.querySelector('section.panel') as HTMLElement;
		return { doc: document.documentElement.scrollWidth, vw: innerWidth, body: panel.scrollWidth, box: panel.clientWidth }; // prettier-ignore
	});
	expect(widths.doc).toBeLessThanOrEqual(widths.vw);
	expect(widths.body).toBeLessThanOrEqual(widths.box);
	await noDesktopHints(page);

	// C12: offline disables the input and Import with its own copy
	await context.setOffline(true);
	await page.evaluate(() => window.dispatchEvent(new Event('offline')));
	await expect(page.getByText("You're offline")).toBeVisible();
	await expect(input).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Import 1' })).toBeDisabled();
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByRole('button', { name: 'Import 1' })).toBeEnabled();

	// C2/C7: Import lands on Today
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 1 events');
	await page.goto('/today');
	await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();

	await api(page, 'POST', '/api/undo', {});
	await expect.poll(async () => (await hits(page, stamp)).length).toBe(0);
});
