// Blind tests for card 09 (desktop), from its Done-when lines only: C1 (radios + unsupported rules + flag clear),
// C2 (save/reload, one undo entry, no scope dialog), C3 (summary line + repeat controls), C5/C6 (water plants:
// done copy today, series +3) and C9 (one Undo restores the series and deletes the copy).
// C4/C7/C8/C10/C15 repo rules live in tests/unit/v4-09-blind.test.ts; C11 phone in
// tests/e2e/phone/v4-09-blind.spec.ts. No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind09 ';

let page: Page;
const created: string[] = [];

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

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

interface Reply {
	status: number;
	json: unknown;
}
async function api(p: Page, method: string, path: string, body?: unknown): Promise<Reply> {
	return p.evaluate(
		async ([m, u, b]) => {
			const hasBody = b !== null && b !== undefined;
			const r = await fetch(u as string, {
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
	status: string;
	repeatFromCompletion?: boolean;
}
async function make(fields: Record<string, unknown>): Promise<Item> {
	const r = await api(page, 'POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: Item }).item;
	created.push(item.id);
	return item;
}
async function getItem(id: string): Promise<Item> {
	const r = await api(page, 'GET', `/api/items/${encodeURIComponent(id)}`);
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return (r.json as { item: Item }).item;
}
interface CalItem {
	id: string;
	title: string;
	date: string | null;
	status: string;
	time: string | null;
}
async function dayItems(from: string, to: string): Promise<CalItem[]> {
	const r = await api(page, 'GET', `/api/calendar?from=${from}&to=${to}`);
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return (r.json as { items: CalItem[] }).items;
}
const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
function addDays(d: string, n: number): string {
	const x = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + n));
	return x.toISOString().slice(0, 10);
}
function mondayOf(d: string): string {
	const x = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))));
	return addDays(d, -((x.getUTCDay() + 6) % 7));
}
/** users.undo_actions straight from the e2e DB (what the toast Undo would replay) */
function undoCount(): number {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return (db.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;
	} finally {
		db.close();
	}
}
const group = () => page.getByRole('radiogroup', { name: 'Next one counts from' });
const finish = () => page.getByRole('radio', { name: 'When I finish it' });
const scheduled = () => page.getByRole('radio', { name: 'Scheduled date' });
const toast = () => page.locator('.toast');

test.afterEach(async () => {
	for (const id of created.splice(0)) await api(page, 'DELETE', `/api/items/${id}`);
});

test('C1 desktop: the radio row shows for daily/monthly without BYDAY/UNTIL/COUNT, hidden for yearly/weekly/BYDAY/UNTIL/COUNT, and a weekly edit clears the saved flag', async () => {
	const daily = await make({ title: `${PREFIX}C1 daily`, date: '2031-03-10', rrule: 'FREQ=DAILY' });
	await page.goto(`/item/${daily.id}`);
	await expect(group()).toBeVisible();
	await expect(scheduled()).toBeChecked();
	await expect(finish()).not.toBeChecked();
	await expect(page.getByText('Next one counts from', { exact: true })).toBeVisible();

	// the option row must be hidden for every unsupported rule shape
	const hidden = [
		['yearly', 'FREQ=YEARLY'],
		['weekly', 'FREQ=WEEKLY;BYDAY=MO'],
		['daily byday', 'FREQ=DAILY;BYDAY=MO'],
		['until', 'FREQ=DAILY;UNTIL=2031-04-01'],
		['count', 'FREQ=DAILY;COUNT=3'],
	];
	for (const [name, rrule] of hidden) {
		const it = await make({ title: `${PREFIX}C1 ${name}`, date: '2031-03-10', rrule });
		await page.goto(`/item/${it.id}`);
		await expect(group(), name).toHaveCount(0);
	}
	const monthly = await make({
		title: `${PREFIX}C1 monthly`,
		date: '2031-03-15',
		rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
	});
	await page.goto(`/item/${monthly.id}`);
	await expect(group()).toBeVisible();

	// flag it, then change the rule to weekly in the normal Repeat select: the flag is cleared in the same edit
	await page.goto(`/item/${daily.id}`);
	await finish().check();
	await expect(toast()).toContainText('Saved');
	await expect.poll(async () => !!(await getItem(daily.id)).repeatFromCompletion).toBe(true);
	await page.getByLabel('Repeat', { exact: true }).selectOption({ index: 2 }); // the builder's weekly preset (BYDAY)
	await expect(toast()).toContainText('Saved');
	await expect(group()).toHaveCount(0);
	await expect.poll(async () => !!(await getItem(daily.id)).repeatFromCompletion).toBe(false);
	expect((await getItem(daily.id)).title).toBe(`${PREFIX}C1 daily`);
});

test('C2 desktop: When I finish saves true, Scheduled date saves false, the flag survives a reload, the PATCH is one undo entry, and editing the series opens no this/following/all dialog', async () => {
	const item = await make({
		title: `${PREFIX}C2 item`,
		date: '2031-03-11',
		time: '09:00',
		rrule: 'FREQ=DAILY',
	});
	await page.goto(`/item/${item.id}`);
	await expect(group()).toBeVisible();
	const before = undoCount();

	await finish().check();
	await expect(toast()).toContainText('Saved');
	await expect.poll(async () => !!(await getItem(item.id)).repeatFromCompletion).toBe(true);
	expect(undoCount()).toBe(before + 1); // one PATCH == one journal entry
	await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);

	// reload keeps the choice and the summary
	await page.reload();
	await expect(group()).toBeVisible();
	await expect(finish()).toBeChecked();
	await expect(page.getByText('Daily, counted from when you finish')).toBeVisible();

	// editing another field edits the whole row: no this/following/all dialog
	await page.getByLabel('Time', { exact: true }).fill('14:00');
	await page.getByLabel('Time', { exact: true }).press('Tab');
	await expect(toast()).toContainText('Saved');
	await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);
	await expect.poll(async () => (await getItem(item.id)).time).toBe('14:00');
	expect((await getItem(item.id)).date).toBe('2031-03-11');
	expect(!!(await getItem(item.id)).repeatFromCompletion).toBe(true);

	// Scheduled date saves false
	await scheduled().check();
	await expect.poll(async () => !!(await getItem(item.id)).repeatFromCompletion).toBe(false);
	await expect(page.getByText('Daily, counted from when you finish')).toHaveCount(0);
});

test('C3 desktop: the summary reads "Daily, counted from when you finish" / "Every 3 days…" / months, and the Repeat select/end controls still edit the same rule', async () => {
	const one = await make({ title: `${PREFIX}C3 daily`, date: '2031-03-12', rrule: 'FREQ=DAILY' });
	await api(page, 'PATCH', `/api/items/${one.id}`, { repeatFromCompletion: true });
	await page.goto(`/item/${one.id}`);
	await expect(page.getByText('Daily, counted from when you finish', { exact: true })).toBeVisible();

	const three = await make({
		title: `${PREFIX}C3 three days`,
		date: '2031-03-13',
		time: '09:00',
		rrule: 'FREQ=DAILY;INTERVAL=3',
	});
	await api(page, 'PATCH', `/api/items/${three.id}`, { repeatFromCompletion: true });
	await page.goto(`/item/${three.id}`);
	await expect(page.getByText('Every 3 days, counted from when you finish', { exact: true })).toBeVisible();

	const months = await make({
		title: `${PREFIX}C3 months`,
		date: '2031-03-14',
		rrule: 'FREQ=MONTHLY;INTERVAL=2',
	});
	await api(page, 'PATCH', `/api/items/${months.id}`, { repeatFromCompletion: true });
	await page.goto(`/item/${months.id}`);
	await expect(page.getByText('Every 2 months, counted from when you finish', { exact: true })).toBeVisible();

	// the end controls still work on a from-completion rule; COUNT makes it unsupported, clearing and hiding the row
	await page.goto(`/item/${three.id}`);
	await page.getByLabel('Repeat ends', { exact: true }).selectOption('count');
	await expect(toast()).toContainText('Saved');
	await expect.poll(async () => (await getItem(three.id)).time).toBe('09:00');
	await expect.poll(async () => !!(await getItem(three.id)).repeatFromCompletion).toBe(false);
	await expect(group()).toHaveCount(0);
	const raw = await page.evaluate(async (id) => {
		const r = await fetch(`/api/items/${id}`);
		return ((await r.json()) as { item: { rrule?: string } }).item.rrule;
	}, three.id);
	expect(raw).toBe('FREQ=DAILY;INTERVAL=3;COUNT=5'); // the rule kept its daily interval
});

test('C12 desktop: no repeat rule means no radio row, and a failed PATCH shows the existing error surface while the radio returns to the stored value', async () => {
	// empty: a plain item has no from-completion row
	const plain = await make({ title: `${PREFIX}C12 plain`, date: '2031-03-16' });
	await page.goto(`/item/${plain.id}`);
	await expect(group()).toHaveCount(0);

	const item = await make({ title: `${PREFIX}C12 fail`, date: '2031-03-17', rrule: 'FREQ=DAILY' });
	await page.goto(`/item/${item.id}`);
	await expect(scheduled()).toBeChecked();

	const url = `**/api/items/${item.id}`;
	await page.route(url, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'boom', message: 'Blind09 save failed.' } }),
				})
			: route.continue(),
	);
	try {
		await finish().check();
		await expect(toast()).toContainText('Blind09 save failed.'); // the item sheet's existing error surface
		await expect(scheduled()).toBeChecked(); // back to the stored value
		await expect(finish()).not.toBeChecked();
	} finally {
		await page.unroute(url);
	}
	expect(!!(await getItem(item.id)).repeatFromCompletion).toBe(false);
	await expect(page.getByText('Daily, counted from when you finish')).toHaveCount(0);
});

test('C5/C6 desktop: ticking "Water plants every 3 days" files a done copy today and moves the series +3 from today (a todo→doing tick moves nothing)', async () => {
	const today = await klToday();
	const title = `${PREFIX}Water plants ${Date.now()}`;
	const item = await make({
		title,
		date: today,
		time: '09:00',
		notes: 'Living room',
		type: 'Hobby',
		private: true,
		rrule: 'FREQ=DAILY;INTERVAL=3',
	});
	await page.goto(`/item/${item.id}`);
	await expect(group()).toBeVisible();
	await finish().check();
	await expect(toast()).toContainText('Saved');
	await expect.poll(async () => !!(await getItem(item.id)).repeatFromCompletion).toBe(true);

	const sq = page.locator('button.sq').first();
	await sq.click(); // todo -> doing: status moves, the date does not
	await expect(toast()).toContainText('Started');
	await expect.poll(async () => (await getItem(item.id)).status).toBe('doing');
	expect((await getItem(item.id)).date).toBe(today);
	const afterOne = await dayItems(today, addDays(today, 1));
	expect(afterOne.filter((i) => i.title === title && i.status === 'done')).toHaveLength(0); // no copy yet

	await sq.click(); // doing -> done: the completion
	await expect(toast()).toContainText('Done');
	await expect.poll(async () => (await getItem(item.id)).date).toBe(addDays(today, 3));
	const series = await getItem(item.id);
	expect(series.status).toBe('todo');
	expect(series.id).toBe(item.id); // the sheet stays on the series

	// one done copy dated today, with the series' fields; the series is at today + 3 only
	const todayRows = (await dayItems(today, addDays(today, 1))).filter((i) => i.title === title);
	expect(todayRows).toHaveLength(1);
	expect(todayRows[0]?.status).toBe('done');
	const copyId = todayRows[0]?.id as string;
	created.push(copyId);
	const copyView = await api(page, 'GET', `/api/items/${encodeURIComponent(copyId)}/view`);
	expect(copyView.status).toBe(200);
	const copy = (copyView.json as { item: { time: string | null; notes: string | null; private: boolean } })
		.item;
	expect(copy).toMatchObject({ time: '09:00', notes: 'Living room', private: true });

	const moved = (await dayItems(addDays(today, 3), addDays(today, 4))).filter((i) => i.title === title);
	expect(moved).toHaveLength(1);
	expect(moved[0]?.id, 'the series row, not an occurrence').toBe(item.id);

	// "shows +3 from today" in the Week view (an item is an all-day row event in FullCalendar).
	// Count only the series: on Mon–Thu the done copy sits in the same Mon–Sun week, so a title-only count
	// was 2 and the test passed only on Fri–Sun.
	await page.goto(`/week?w=${mondayOf(addDays(today, 3))}`);
	const seriesEvents = page.locator('.wk .fc-event:not(.is-done)', { hasText: title });
	await expect(seriesEvents).toHaveCount(1);
	await expect(seriesEvents.locator('.lt-title')).toContainText(title);
});

test('C9 desktop: one Undo after the completion restores the series date and status and removes the done copy', async () => {
	const today = await klToday();
	const title = `${PREFIX}Undo plants ${Date.now()}`;
	const item = await make({ title, date: today, rrule: 'FREQ=DAILY;INTERVAL=3' });
	await api(page, 'PATCH', `/api/items/${item.id}`, { repeatFromCompletion: true });
	await page.goto(`/item/${item.id}`);
	const sq = page.locator('button.sq').first();
	await sq.click(); // todo -> doing
	await expect(toast()).toContainText('Started');
	await sq.click(); // doing -> done: one completion
	await expect(toast()).toContainText('Done');
	await expect.poll(async () => (await getItem(item.id)).date).toBe(addDays(today, 3));
	expect(await page.getByRole('heading', { level: 1, name: title, exact: true }).isVisible()).toBe(true);

	await toast().getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await getItem(item.id)).date).toBe(today);
	await expect.poll(async () => (await getItem(item.id)).status).toBe('doing');

	// one click removed the copy and kept the series: exactly one row with this title today
	const rows = (await dayItems(today, addDays(today, 1))).filter((i) => i.title === title);
	expect(rows).toHaveLength(1);
	expect(rows[0]?.id).toBe(item.id);
	expect(rows[0]?.status).toBe('doing');
});
