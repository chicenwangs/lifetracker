// Card 11 (D-V4-12 / D-V4-29 / D-V4-37) on desktop: Settings › Import › Calendar file (.ics).
// Upload -> inline preview (counts, skipped reasons, update count, default type) -> Import -> items on
// Today/Week -> one Undo; the browser re-posts the File. Also the 1 MB and 2 000-event refusals, the empty
// file state and the offline state.
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

/** owner-local date n days from now (the Playwright project timezone is Asia/Kuala_Lumpur) */
const day = (n: number) => {
	const d = new Date(Date.now() + n * 86_400_000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const compact = (date: string) => date.replace(/-/g, '');

/** one VEVENT block */
const event = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const ics = (body: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR', ''].join('\r\n');
const file = (text: string, name = 'calendar.ics') => ({
	name,
	mimeType: 'text/calendar',
	buffer: Buffer.from(text),
});

/** items on the calendar API, so a title/type/date check does not depend on a view */
const calItems = async (page: Page, from: string, to: string) =>
	((await api(page, 'GET', `/api/calendar?from=${from}&to=${to}`)).j as { items: Record<string, unknown>[] })
		.items;
const hits = async (page: Page, q: string) =>
	(
		(await api(page, 'GET', `/api/search?q=${encodeURIComponent(q)}`)).j as {
			items: { id: string; title: string }[];
		}
	).items;

test('C1 a file over 1 MB is refused inline before upload, and the server re-checks the file part', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles({
		name: 'big.ics',
		mimeType: 'text/calendar',
		buffer: Buffer.alloc(1_000_001, 0x41),
	});
	await expect(page.locator('.alert')).toHaveText('The file is over 1 MB.');
	await expect(page.locator('.toast')).toHaveCount(0); // never a toast

	// bypass the client: the action re-checks the same 1 000 000 bytes
	const res = await page.evaluate(async () => {
		const fd = new FormData();
		fd.set('file', new File([new Uint8Array(1_000_001)], 'big.ics', { type: 'text/calendar' }));
		const r = await fetch('/settings/import?/preview', {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' },
		});
		return { status: r.status, text: await r.text() };
	});
	// an enhanced action answers 200 with the failure in the payload
	expect(res.status).toBe(200);
	expect(res.text).toContain('"type":"failure"');
	expect(res.text).toContain('"status":400');
	expect(res.text).toContain('The file is over 1 MB.');
	expect(await hits(page, 'big.ics')).toHaveLength(0);
});

test('C2/C3/C4/C5/C7 preview counts and reasons, default type, import to Today and Week, one Undo', async ({
	page,
}) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const today = day(0);
	for (const t of await types(page))
		if (!t.onCalendar) await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: true });
	const allTypes = await types(page);
	const off = allTypes[1] as TypeRow;
	const chosen = allTypes[0] as TypeRow;
	await api(page, 'PATCH', `/api/item-types/${off.id}`, { onCalendar: false });
	try {
		await page.goto('/settings/import');
		const allDay = `ICS ${stamp} all day`;
		const weekly = `ICS ${stamp} weekly`;
		const utc = `ICS ${stamp} utc`;
		const span = `ICS ${stamp} span`;
		const text = ics([
			...event([
				`UID:ics-a-${stamp}`,
				`SUMMARY:${allDay}`,
				`DTSTART;VALUE=DATE:${compact(today)}`,
				`DTEND;VALUE=DATE:${compact(day(1))}`,
			]),
			...event([
				`UID:ics-w-${stamp}`,
				`SUMMARY:${weekly}`,
				`DTSTART;TZID=Asia/Kuala_Lumpur:${compact(today)}T090000`,
				`DTEND;TZID=Asia/Kuala_Lumpur:${compact(today)}T100000`,
				'RRULE:FREQ=WEEKLY;COUNT=4',
				`EXDATE;TZID=Asia/Kuala_Lumpur:${compact(day(7))}T090000`,
			]),
			...event([
				`UID:ics-u-${stamp}`,
				`SUMMARY:${utc}`,
				`DTSTART:${compact(today)}T010000Z`, // 09:00 in Kuala Lumpur
				`DTEND:${compact(today)}T020000Z`,
			]),
			...event([
				`UID:ics-s-${stamp}`,
				`SUMMARY:${span}`,
				`DTSTART;VALUE=DATE:${compact(today)}`,
				`DTEND;VALUE=DATE:${compact(day(3))}`, // ends on today + 2
			]),
			// skipped: duplicate UID, no UID, and a rule we refuse to guess
			...event([`UID:ics-a-${stamp}`, `SUMMARY:ICS ${stamp} clash`, `DTSTART:${compact(today)}T110000`]),
			...event([`SUMMARY:ICS ${stamp} no id`, `DTSTART:${compact(today)}T120000`]),
			...event([
				`UID:ics-bad-${stamp}`,
				`SUMMARY:ICS ${stamp} week no`,
				`DTSTART:${compact(today)}T130000`,
				'RRULE:FREQ=YEARLY;BYWEEKNO=20',
			]),
		]);
		await page.getByLabel('Calendar file (.ics)').setInputFiles(file(text));

		const big = page.locator('.big');
		await expect(big).toContainText('4 events · 1 repeating · 3 skipped');
		await expect(page.getByLabel('Put them in type')).toHaveValue(off.key); // first type with Month off
		await expect(page.locator('.toast')).toHaveCount(0);
		await page.getByLabel('Put them in type').selectOption(chosen.key); // C2: choose the type

		await page.getByText('Skipped (3)').click();
		const skipped = page.locator('.skipped');
		await expect(skipped).toContainText(`"ICS ${stamp} clash" — duplicate UID`);
		await expect(skipped).toContainText(`"ICS ${stamp} no id" — no ID`);
		await expect(skipped).toContainText(`"ICS ${stamp} week no" — repeats by week number, not supported`);

		await page.getByRole('button', { name: 'Import 4' }).click();
		await expect(page.locator('.toast')).toContainText('Imported 4 events');
		await expect(page.locator('.big')).toHaveCount(0); // the panel closes after the import

		// C4/C7: local dates and times, the chosen type, the rule and the EXDATE
		const rows = await calItems(page, today, day(10));
		const mine = rows.filter((r) => String(r.title).includes(stamp));
		expect(mine).toHaveLength(4);
		const byTitle = (t: string) => rows.find((r) => r.title === t) as Record<string, unknown>;
		expect(byTitle(allDay)).toMatchObject({ date: today, time: null, type: chosen.key });
		expect(byTitle(weekly)).toMatchObject({
			date: today,
			time: '09:00',
			type: chosen.key,
			rrule: 'FREQ=WEEKLY;COUNT=4',
			exdates: [day(7)],
		});
		expect(byTitle(utc)).toMatchObject({ date: today, time: '09:00' });
		expect(byTitle(span)).toMatchObject({ date: today, endDate: day(2) });

		// C10: the whole import is one Undo (the toast button, before it expires)
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await hits(page, stamp)).length).toBe(0);

		// C2/C7: import the same file again and check Today and Week
		await page.getByLabel('Calendar file (.ics)').setInputFiles(file(text, 'again.ics'));
		await page.getByRole('button', { name: 'Import 4' }).click();
		await expect(page.locator('.toast')).toContainText('Imported 4 events');
		const shown = (t: string) => page.getByText(t).filter({ visible: true });
		await page.goto('/today');
		await expect(shown(weekly).first()).toBeVisible(); // Today lists timed items
		await page.goto('/week');
		await expect(shown(allDay).first()).toBeVisible();
		await expect(shown(utc).first()).toBeVisible();
		await api(page, 'POST', '/api/undo', {}); // cleanup
	} finally {
		await api(page, 'PATCH', `/api/item-types/${off.id}`, { onCalendar: true });
	}
});

test('C9 re-import updates a live row by UID (title/time/rule, not date), adds new UIDs, never duplicates', async ({
	page,
}) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const first = ics([
		...event([
			`UID:ics-re-${stamp}`,
			`SUMMARY:ICS ${stamp} old`,
			`DTSTART;TZID=Asia/Kuala_Lumpur:${compact(day(1))}T090000`,
			`DTEND;TZID=Asia/Kuala_Lumpur:${compact(day(1))}T100000`,
		]),
	]);
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles(file(first));
	await page.getByRole('button', { name: 'Import 1' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 1 events');

	const second = ics([
		...event([
			`UID:ics-re-${stamp}`,
			`SUMMARY:ICS ${stamp} new`,
			`DTSTART;TZID=Asia/Kuala_Lumpur:${compact(day(2))}T110000`, // a different date must not move it
			`DTEND;TZID=Asia/Kuala_Lumpur:${compact(day(2))}T120000`,
			'RRULE:FREQ=DAILY;COUNT=3',
		]),
		...event([`UID:ics-new-${stamp}`, `SUMMARY:ICS ${stamp} added`, `DTSTART:${compact(day(3))}T090000`]),
	]);
	await page.getByLabel('Calendar file (.ics)').setInputFiles(file(second, 'again.ics'));
	await expect(page.locator('.big')).toContainText('2 events · 1 repeating · 0 skipped');
	await expect(page.getByText('Already imported: 1 will be updated')).toBeVisible();
	await page.getByRole('button', { name: 'Import 2' }).click();
	await expect(page.locator('.toast')).toContainText('Imported 2 events');

	const rows = (await calItems(page, day(1), day(10))).filter((r) => String(r.title).includes(stamp));
	// repeating rows expand to one DTO per occurrence: count series, not occurrences
	expect(new Set(rows.map((r) => r.seriesId ?? r.id)).size).toBe(2);
	const updated = rows.find((r) => r.title === `ICS ${stamp} new`) as Record<string, unknown>;
	expect(updated).toMatchObject({
		date: day(1), // unchanged
		time: '11:00',
		rrule: 'FREQ=DAILY;COUNT=3',
	});
	expect(await hits(page, `ICS ${stamp} old`)).toHaveLength(0);
});

test('C12 an empty file says so and Import stays disabled; offline disables the input and Import', async ({
	page,
	context,
}) => {
	await signIn(page);
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles(file(ics([]), 'empty.ics'));
	await expect(page.getByText('No events in this file.')).toBeVisible();
	await expect(page.locator('.big')).toContainText('0 events · 0 repeating · 0 skipped');
	await expect(page.getByRole('button', { name: 'Import 0' })).toBeDisabled();

	await page
		.getByLabel('Calendar file (.ics)')
		.setInputFiles(
			file(
				ics([
					...event([`UID:ics-off-${Date.now()}`, 'SUMMARY:ICS offline', `DTSTART:${compact(day(0))}T090000`]),
				]),
			),
		);
	await expect(page.locator('.big')).toContainText('1 event');
	await context.setOffline(true);
	await page.evaluate(() => window.dispatchEvent(new Event('offline')));
	await expect(page.getByText("You're offline")).toBeVisible();
	await expect(page.getByLabel('Calendar file (.ics)')).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Import 1' })).toBeDisabled();
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByRole('button', { name: 'Import 1' })).toBeEnabled();
});

test('C8 a file with more than 2 000 events is refused with the count and nothing is written', async ({
	page,
}) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const many: string[] = [];
	for (let i = 0; i < 2001; i++)
		many.push(
			...event([`UID:ics-many-${stamp}-${i}`, `SUMMARY:Event ${i}`, `DTSTART:${compact(day(0))}T090000`]),
		);
	await page.goto('/settings/import');
	await page.getByLabel('Calendar file (.ics)').setInputFiles(file(ics(many), 'many.ics'));
	await expect(page.locator('.alert')).toContainText('2001');
	await expect(page.locator('.alert')).toContainText('2000');
	await expect(page.locator('.toast')).toHaveCount(0);
	await expect(page.locator('.big')).toHaveCount(0);
	expect(await hits(page, stamp)).toHaveLength(0);
});
