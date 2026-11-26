// Blind tests for card 03, from its Done-when lines only (desktop): C3–C11 and C13–C14.
// C12/C15 live in tests/e2e/phone/v4-03-blind.spec.ts. No builder test was opened.
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; try that first, then the original.
const RESET_PW = 'reset pass phrase 1';

let page: Page;

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		for (const pw of [RESET_PW, PW]) {
			await p.fill('#u', 'jeremy');
			await p.fill('#p', pw);
			await p.click('button[type=submit]');
			await p.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!p.url().includes('/login')) break;
		}
	}
	await expect(p).not.toHaveURL(/\/(setup|login)/);
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

interface ApiReply {
	status: number;
	json: unknown;
}
async function api(method: string, path: string, body?: unknown): Promise<ApiReply> {
	return page.evaluate(
		async ([m, p, b]) => {
			const hasBody = b !== null && b !== undefined;
			const r = await fetch(p as string, {
				method: m as string,
				headers: hasBody ? { 'content-type': 'application/json' } : undefined,
				body: hasBody ? JSON.stringify(b) : undefined,
			});
			return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
		},
		[method, path, body ?? null] as const,
	);
}

interface Item {
	id: string;
	title: string;
	date: string | null;
	endDate: string | null;
	time: string | null;
	rrule?: string | null;
}
async function getItem(id: string): Promise<Item> {
	const r = await api('GET', `/api/items/${encodeURIComponent(id)}`);
	return (r.json as { item: Item }).item;
}
async function makeItem(fields: Record<string, unknown>): Promise<Item> {
	const r = await api('POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	return (r.json as { item: Item }).item;
}
async function calendarItems(from: string, to: string): Promise<Item[]> {
	const r = await api('GET', `/api/calendar?from=${from}&to=${to}`);
	return (r.json as { items: Item[] }).items;
}

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const addDays = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** the app's prettyDate: "Mon 30 Nov 2026" */
function pretty(date: string) {
	const t = new Date(`${date}T00:00:00Z`);
	const wd = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
	return `${WD[wd - 1]} ${String(t.getUTCDate()).padStart(2, '0')} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; // prettier-ignore
}
const LIST5 = ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…'];

test('C3 ItemView: Postpone beside Date, exactly five moves in order, and Skip last on a repeat occurrence', async () => {
	const plain = await makeItem({ title: 'Blind C3 plain', date: '2030-05-10', time: '11:00' });
	await page.goto(`/item/${plain.id}`);
	const btn = page.getByRole('button', { name: 'Postpone ▾' });
	await expect(btn).toBeVisible();
	// sits beside the Date field: same prop row, to the right of a date input, same visual line
	const beside = await btn.evaluate((n) => {
		const row = n.closest('.props');
		const date = row?.querySelector<HTMLInputElement>('input[type=date]');
		if (!date) return false;
		const a = n.getBoundingClientRect();
		const b = date.getBoundingClientRect();
		return a.left > b.left && Math.abs(a.top - b.top) < 40;
	});
	expect(beside).toBe(true);

	await btn.click();
	const list = page.getByRole('group', { name: 'Postpone' });
	await expect(list).toBeVisible();
	await expect(list.getByRole('button')).toHaveText(LIST5);

	// choosing one PATCHes {date} and moves the item
	const tomorrow = addDays(await klToday(), 1);
	await list.getByRole('button', { name: 'Tomorrow', exact: true }).click();
	await expect(page.locator('.toast')).toContainText(`Moved "Blind C3 plain" to ${pretty(tomorrow)}`);
	await expect.poll(async () => (await getItem(plain.id)).date).toBe(tomorrow);

	// the same five on a repeat occurrence, then Skip this one (C8)
	const series = await makeItem({
		title: 'Blind C3 series',
		date: '2030-05-13',
		time: '12:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
	});
	await page.goto(`/item/${series.id}@2030-05-20`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await expect(page.getByRole('group', { name: 'Postpone' }).getByRole('button')).toHaveText([
		...LIST5,
		'Skip this one',
	]);
});

test('C4 Postpone keeps the time and moves a multi-day endDate by the same span', async () => {
	const it = await makeItem({
		title: 'Blind C4 span',
		date: '2030-06-20',
		time: '09:15',
		endDate: '2030-06-22',
	});
	await page.goto(`/item/${it.id}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: '+1 week', exact: true })
		.click();
	const target = addDays(await klToday(), 7);
	await expect
		.poll(async () => {
			const x = await getItem(it.id);
			return [x.date, x.endDate, x.time];
		})
		.toEqual([target, addDays(target, 2), '09:15']);
});

test('C5 one undo entry per postpone: toast Undo and Ctrl+Z restore date and endDate; an undone detached peek closes', async () => {
	const it = await makeItem({
		title: 'Blind C5 undo',
		date: '2030-07-10',
		time: '08:45',
		endDate: '2030-07-12',
	});
	await page.goto(`/item/${it.id}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Tomorrow', exact: true })
		.click();
	const tomorrow = addDays(await klToday(), 1);
	const toast = page.locator('.toast');
	await expect(toast).toContainText(`Moved "Blind C5 undo" to ${pretty(tomorrow)}`);
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect
		.poll(async () => {
			const x = await getItem(it.id);
			return [x.date, x.endDate];
		})
		.toEqual(['2030-07-10', '2030-07-12']);

	// Ctrl+Z is the same journal entry
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Next weekday', exact: true })
		.click();
	await expect(page.locator('.toast')).toContainText('Moved "Blind C5 undo" to');
	await page.keyboard.press('Control+z');
	await expect
		.poll(async () => {
			const x = await getItem(it.id);
			return [x.date, x.endDate];
		})
		.toEqual(['2030-07-10', '2030-07-12']);

	// D-V4-16: Undo removed the detached row the open sheet shows -> the sheet closes, no dead row
	const series = await makeItem({
		title: 'Blind C5 series',
		date: '2030-07-15',
		time: '10:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
	});
	const occ = `${series.id}@2030-07-22`;
	await page.goto(`/?item=${encodeURIComponent(occ)}`);
	const peek = page.getByRole('dialog', { name: 'Item' });
	await expect(peek).toBeVisible();
	await peek.getByRole('button', { name: 'Postpone ▾' }).click();
	await peek
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Tomorrow', exact: true })
		.click();
	await expect(page.locator('.toast')).toContainText('Moved "Blind C5 series" to');
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(peek).toBeHidden();
	await expect
		.poll(async () => (await calendarItems('2030-07-01', '2030-08-01')).some((x) => x.id === occ))
		.toBe(true); // the occurrence is back on the series
});

test('C6 postponing id@date detaches one occurrence: one EXDATE, a new row, no scope dialog, the sheet follows it', async () => {
	const series = await makeItem({
		title: 'Blind C6 series',
		date: '2030-08-05',
		time: '10:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
	});
	await page.goto(`/item/${series.id}@2030-08-12`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Tomorrow', exact: true })
		.click();
	// D-V4-16: no repeat-scope dialog for a postpone
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
	expect(await page.getByText(/Edit repeating item/).count()).toBe(0);

	// the open sheet follows the detached row (its URL leaves the @date)
	await expect(page).toHaveURL(/\/item\/[^@/]+$/);
	const target = addDays(await klToday(), 1);
	const followed = decodeURIComponent(new URL(page.url()).pathname.split('/item/')[1] ?? '');
	expect(followed).not.toContain('@');
	const made = await getItem(followed);
	expect(made.title).toBe('Blind C6 series');
	expect(made.date).toBe(target);
	expect(made.rrule ?? null).toBeNull(); // standalone row

	// one EXDATE: that date is no longer an occurrence
	const ids = (await calendarItems('2030-08-01', '2030-09-01')).map((x) => x.id);
	expect(ids).not.toContain(`${series.id}@2030-08-12`);
	// the series keeps its rule and its other dates
	const saved = await getItem(series.id);
	expect(saved.date).toBe('2030-08-05');
	expect(saved.time).toBe('10:00');
	expect(saved.rrule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=4');
	expect(
		(await calendarItems('2030-08-01', '2030-09-01'))
			.filter((x) => x.title === 'Blind C6 series')
			.map((x) => x.date),
	).toEqual(['2030-08-05', '2030-08-19', '2030-08-26']);
});

test('C7 a linked block stays put; one toast names the earliest block day, an item without one gets the plain toast', async () => {
	const tomorrow = addDays(await klToday(), 1);

	const plain = await makeItem({ title: 'Blind C7 plain', date: '2030-09-10', time: '11:30' });
	await page.goto(`/item/${plain.id}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Tomorrow', exact: true })
		.click();
	await expect(page.locator('.toast')).toHaveCount(1);
	await expect(page.locator('.toast')).toContainText(`Moved "Blind C7 plain" to ${pretty(tomorrow)}`);
	expect(await page.locator('.toast').innerText()).not.toContain('Planner block stays');

	const it = await makeItem({ title: 'Blind C7 block', date: '2030-09-15', time: '09:00' });
	for (const startAt of ['2030-09-17T02:00:00Z', '2030-09-20T02:00:00Z']) {
		const b = await api('POST', '/api/blocks', {
			itemId: it.id,
			startAt,
			endAt: `${startAt.slice(0, 11)}03:00:00Z`,
		});
		expect(b.status, JSON.stringify(b.json)).toBe(201);
	}
	await page.goto(`/item/${it.id}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Tomorrow', exact: true })
		.click();
	await expect(page.locator('.toast')).toHaveCount(1);
	await expect(page.locator('.toast')).toContainText(
		`Moved "Blind C7 block" to ${pretty(tomorrow)} · Planner block stays on ${pretty('2030-09-17')}`,
	);
	// the blocks were not moved; the earliest by start is the one named
	const cal = (await api('GET', '/api/calendar?from=2030-09-16&to=2030-09-22')).json as {
		blocks: { itemId: string | null; startAt: string }[];
	};
	expect(
		cal.blocks
			.filter((b) => b.itemId === it.id)
			.map((b) => b.startAt)
			.sort(),
	).toEqual(['2030-09-17T02:00:00Z', '2030-09-20T02:00:00Z']);
});

test('C8 Skip this one is only on a repeat occurrence; POST /skip adds exactly one EXDATE and no new row', async () => {
	const plain = await makeItem({ title: 'Blind C8 plain', date: '2030-10-01', time: '08:00' });
	await page.goto(`/item/${plain.id}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await expect(page.getByRole('group', { name: 'Postpone' }).getByRole('button')).toHaveText(LIST5); // prettier-ignore
	await expect(
		page.getByRole('group', { name: 'Postpone' }).getByRole('button', { name: 'Skip this one' }),
	).toHaveCount(0);

	const series = await makeItem({
		title: 'Blind C8 series',
		date: '2030-10-07',
		time: '09:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
	});
	await page.goto(`/item/${series.id}@2030-10-14`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await expect(page.getByRole('group', { name: 'Postpone' }).getByRole('button')).toHaveText([
		...LIST5,
		'Skip this one',
	]);

	// the new route: POST /api/items/<id@date>/skip
	const skip = await api('POST', `/api/items/${series.id}@2030-10-14/skip`);
	expect(skip.status).toBe(200);
	const body = skip.json as { undo?: { id: string; label: string } };
	expect(body.undo?.id).toMatch(/^und_/); // returns an undo ref
	expect(body.undo?.label).toBe('Skip "Blind C8 series"');

	// exactly one EXDATE; the series is otherwise unchanged
	const ids = (await calendarItems('2030-10-01', '2030-11-01')).map((x) => x.id);
	expect(ids).not.toContain(`${series.id}@2030-10-14`);
	const saved = await getItem(series.id);
	expect(saved.date).toBe('2030-10-07');
	expect(saved.time).toBe('09:00');
	expect(saved.rrule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=4');
	expect(
		(await calendarItems('2030-10-01', '2030-11-01'))
			.filter((x) => x.title === 'Blind C8 series')
			.map((x) => x.date),
	).toEqual(['2030-10-07', '2030-10-21', '2030-10-28']); // one date gone, no standalone row
});

test('C9 Skip undo is one undo entry: Undo removes that EXDATE and the occurrence is back', async () => {
	const series = await makeItem({
		title: 'Blind C9 series',
		date: '2030-11-04',
		time: '09:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
	});
	const occ = `${series.id}@2030-11-11`;
	await page.goto(`/item/${occ}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page.getByRole('group', { name: 'Postpone' }).getByRole('button', { name: 'Skip this one' }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Skipped this one: "Blind C9 series"');
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	const inCal = async (id: string) =>
		(await calendarItems('2030-11-01', '2030-12-01')).some((x) => x.id === id);
	await expect.poll(() => inCal(occ)).toBe(false);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => inCal(occ)).toBe(true);

	// API path: one POST /undo is enough for one Skip (a second journal entry would leave the EXDATE behind)
	const occ2 = `${series.id}@2030-11-18`;
	expect((await api('POST', `/api/items/${occ2}/skip`)).status).toBe(200);
	expect(await inCal(occ2)).toBe(false);
	const undo = await api('POST', '/api/undo', {});
	expect(undo.status).toBe(200);
	expect((undo.json as { label: string }).label).toBe('Skip "Blind C9 series"');
	expect(await inCal(occ2)).toBe(true);
	expect(await inCal(occ)).toBe(true); // the first occurrence stayed back
});

test('C10 after Skip nothing fires on the skipped date: relative moves to the next occurrence, absolute inside it is gone', async () => {
	const series = await makeItem({
		title: 'Blind C10 series',
		date: '2030-10-07',
		time: '10:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
	});
	const rel = await api('POST', '/api/reminders', {
		source: 'planner_item',
		sourceId: series.id,
		offset: '2h',
	});
	expect(rel.status, JSON.stringify(rel.json)).toBe(201);
	const relId = (rel.json as { reminder: { id: string; dueAt: string } }).reminder.id;
	expect((rel.json as { reminder: { dueAt: string } }).reminder.dueAt).toBe('2030-10-07T00:00:00Z'); // 08:00 KL

	// skip the first occurrence: the relative reminder points at the second
	expect((await api('POST', `/api/items/${series.id}@2030-10-07/skip`)).status).toBe(200);
	let list = (await api('GET', `/api/reminders?source=planner_item&id=${series.id}`)).json as {
		reminders: { id: string; dueAt: string | null }[];
	};
	expect(list.reminders.find((r) => r.id === relId)?.dueAt).toBe('2030-10-14T00:00:00Z');

	// an absolute reminder due inside the next occurrence (09:00 KL) must not fire after that date is skipped
	const abs = await api('POST', '/api/reminders', {
		source: 'planner_item',
		sourceId: series.id,
		at: '2030-10-14T01:00:00Z',
	});
	expect(abs.status, JSON.stringify(abs.json)).toBe(201);
	const absId = (abs.json as { reminder: { id: string } }).reminder.id;
	expect((await api('POST', `/api/items/${series.id}@2030-10-14/skip`)).status).toBe(200);

	list = (await api('GET', `/api/reminders?source=planner_item&id=${series.id}`)).json as {
		reminders: { id: string; dueAt: string | null }[];
	};
	expect(list.reminders.map((r) => r.id)).not.toContain(absId); // gone, not merely moved
	expect(list.reminders.find((r) => r.id === relId)?.dueAt).toBe('2030-10-21T00:00:00Z'); // next occurrence
});

test('C11 a foreign id is 404 for PATCH, skip and view: no shared read-only sheet carries Postpone/Skip', async ({
	browser,
}) => {
	const it = await makeItem({ title: 'Blind C11 mine', date: '2030-12-02', time: '10:00' });
	const series = await makeItem({
		title: 'Blind C11 series',
		date: '2030-12-03',
		time: '10:00',
		rrule: 'FREQ=DAILY;COUNT=2',
	});

	// invite a second account (the app has no users API): admin makes a code, the partner signs up
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	await expect(page.locator('[role="status"] code').first()).toBeVisible();
	const code = (await page.locator('[role="status"] code').first().innerText()).trim();
	expect(code).toMatch(/^INV-/);

	const ctx = await browser.newContext();
	try {
		const n = await ctx.newPage();
		await n.goto('/signup');
		await n.fill('#code', code);
		await n.fill('#nu', 'blind03partner');
		await n.fill('#dn', 'Blind Partner');
		await n.fill('#np', 'blind partner phrase');
		await n.fill('#cp', 'blind partner phrase');
		await n.getByRole('button', { name: 'Create account' }).click();
		await n.waitForURL((u) => u.pathname === '/');
		const foreign = (method: string, path: string, body?: unknown) =>
			n.evaluate(
				async ([m, p, b]) => {
					const hasBody = b !== null && b !== undefined;
					const r = await fetch(p as string, {
						method: m as string,
						headers: hasBody ? { 'content-type': 'application/json' } : undefined,
						body: hasBody ? JSON.stringify(b) : undefined,
					});
					return { status: r.status, text: await r.text() };
				},
				[method, path, body ?? null] as const,
			);
		expect((await foreign('PATCH', `/api/items/${it.id}`, { date: '2030-12-09' })).status).toBe(404);
		expect((await foreign('POST', `/api/items/${series.id}@2030-12-04/skip`)).status).toBe(404);
		expect((await foreign('GET', `/api/items/${it.id}/view`)).status).toBe(404);
	} finally {
		await ctx.close();
	}

	// no write landed on the owner's rows
	expect((await getItem(it.id)).date).toBe('2030-12-02');
	expect(
		(await calendarItems('2030-12-01', '2030-12-06')).some((x) => x.id === `${series.id}@2030-12-04`),
	).toBe(true);
});

test('C13 a refused save shows the server message and leaves the date; the list appears at once and the toast follows the response', async () => {
	const it = await makeItem({ title: 'Blind C13 refused', date: '2030-12-20', time: '10:00' });
	await page.goto(`/item/${it.id}`);
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	await page.route('**/api/items/*', async (route) => {
		if (route.request().method() !== 'PATCH') return route.continue();
		await gate;
		await route.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'bad_request', message: 'Blind refused save.' } }),
		});
	});
	try {
		await page.getByRole('button', { name: 'Postpone ▾' }).click();
		const list = page.getByRole('group', { name: 'Postpone' });
		await expect(list).toBeVisible();
		await expect(list.getByRole('button')).toHaveCount(5); // no loading row, the real list at once
		await list.getByRole('button', { name: 'Tomorrow', exact: true }).click();
		expect(await page.locator('.toast').count()).toBe(0); // the toast follows the response
		release();
		const toast = page.locator('.toast');
		await expect(toast).toHaveAttribute('role', 'alert');
		await expect(toast).toContainText('Blind refused save.');
		await expect.poll(async () => (await getItem(it.id)).date).toBe('2030-12-20');
		await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2030-12-20');
	} finally {
		await page.unroute('**/api/items/*');
	}
});

test('C14 an undated item hides Postpone ▾', async () => {
	const it = await makeItem({ title: 'Blind C14 undated' });
	await page.goto(`/item/${it.id}`);
	await expect(page.getByLabel('Date', { exact: true })).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Postpone ▾' })).toHaveCount(0);
});
