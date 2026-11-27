// Blind tests for card 03 on the phone projects, from its Done-when lines only: C12 and C15.
// No builder test was opened.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { HINTS, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1';

let page: Page;
let P = '';

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		// no phone spec resets the password, but a desktop reset must not block this file
		for (const pw of [PW, RESET_PW]) {
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
	await setHints(p, HINTS);
}

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	P = info.project.name;
	await signIn(page);
});
test.afterAll(() => page.context().close());

interface Item {
	id: string;
	date: string | null;
	time: string | null;
}
async function makeItem(fields: Record<string, unknown>): Promise<Item> {
	const r = await page.evaluate(async (b) => {
		const res = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(b),
		});
		return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
	}, fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	return (r.json as { item: Item }).item;
}
async function getItem(id: string) {
	const r = await page.evaluate(async (i) => {
		const res = await fetch(`/api/items/${encodeURIComponent(i)}`);
		return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
	}, id);
	return { ...r, item: (r.json as { item: Item } | null)?.item };
}
const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
const addDays = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const LIST5 = ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…'];
const taller48 = async (el: Locator) =>
	(await el.evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().height))).every((h) => h >= 48);

test('C12 phone: the set lives in ItemView and the Today row ⋯ sheet (Skip where it applies), 48 dp rows, Back closes first, no key hints, no Week/Month menu', async () => {
	const DAY = '2031-03-04'; // a Tuesday; titles carry the project name so both phone runs can share it
	const plain = await makeItem({ title: `Blind C12 plain ${P}`, date: DAY, time: '08:00' });
	await makeItem({
		title: `Blind C12 series ${P}`,
		date: DAY,
		time: '09:00',
		rrule: 'FREQ=DAILY;COUNT=3',
	});

	// ItemView on the phone: the same five, 48 dp, and Back closes the list before the page
	await page.goto(`/item/${plain.id}`);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	const list = page.getByRole('group', { name: 'Postpone' });
	await expect(list).toBeVisible();
	await expect(list.getByRole('button')).toHaveText(LIST5);
	expect(await taller48(list.getByRole('button'))).toBe(true);
	await noDesktopHints(page);
	await page.goBack();
	await expect(list).toBeHidden();
	expect(new URL(page.url()).pathname).toBe(`/item/${plain.id}`);

	// the existing Today row ⋯ sheet is the shared ActionSheet with the same list
	await page.goto(`/today?d=${DAY}`);
	await page.getByRole('button', { name: `Actions for Blind C12 plain ${P}` }).click();
	const sheet = page.getByRole('dialog', { name: `Actions for Blind C12 plain ${P}` });
	await expect(sheet).toBeVisible();
	const actions = sheet.getByRole('button').filter({ hasText: /.+/ }); // skip the icon-only sheet buttons
	await expect(actions).toHaveText(['Done', 'Move…', ...LIST5, 'Delete']);
	expect(await taller48(actions)).toBe(true);
	await noDesktopHints(page);
	await page.goBack(); // Back closes the sheet, not the page
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');

	// a repeating occurrence gets Skip after Pick date…
	await page.getByRole('button', { name: `Actions for Blind C12 series ${P}` }).click();
	const seriesSheet = page.getByRole('dialog', { name: `Actions for Blind C12 series ${P}` });
	await expect(seriesSheet.getByRole('button').filter({ hasText: /.+/ })).toHaveText([
		'Done',
		'Move…',
		...LIST5,
		'Skip this one',
		'Delete',
	]);
	await page.goBack();
	await expect(seriesSheet).toBeHidden();

	// D-V4-04: no new Week/Month row menus — the existing ones keep only their old actions
	await page.goto('/week?w=2031-03-03');
	await expect(page.getByRole('button', { name: 'Postpone ▾' })).toHaveCount(0);
	const weekMenus = page.getByRole('button', { name: `Actions for Blind C12 series ${P}` });
	expect(await weekMenus.count()).toBeGreaterThan(0);
	await weekMenus.first().click();
	const weekSheet = page.getByRole('dialog', { name: `Actions for Blind C12 series ${P}` });
	await expect(weekSheet.getByRole('button').filter({ hasText: /.+/ })).toHaveText([
		'Done',
		'Move…',
		'Delete',
	]);
	await page.goBack();
	await expect(weekSheet).toBeHidden();
	await page.goto('/month?m=2031-03&d=2031-03-04');
	await expect(page.getByRole('button', { name: 'Postpone ▾' })).toHaveCount(0);
	await page.getByRole('button', { name: `Actions for Blind C12 series ${P}` }).click();
	const monthSheet = page.getByRole('dialog', { name: `Actions for Blind C12 series ${P}` });
	await expect(monthSheet.getByRole('button').filter({ hasText: /.+/ })).toHaveText([
		'Done',
		'Move…',
		'Delete',
	]);
});

test('C15 offline: a postpone queues and syncs; Skip shows the offline toast, changes nothing and queues nothing', async () => {
	const plain = await makeItem({ title: `Blind C15 plain ${P}`, date: '2031-03-11', time: '08:00' });
	const target = addDays(await klToday(), 1);
	await page.goto(`/item/${plain.id}`);
	await page.context().setOffline(true);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page
		.getByRole('group', { name: 'Postpone' })
		.getByRole('button', { name: 'Tomorrow', exact: true })
		.click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Waiting to sync');
	const queue = await page.evaluate(() => localStorage.getItem('lt_action_queue') ?? '');
	expect(queue).toContain(`/api/items/${plain.id}`);
	expect(queue).toContain(target);
	await page.context().setOffline(false);
	await expect(toast).toContainText('Back online');
	await expect.poll(async () => (await getItem(plain.id)).item?.date).toBe(target);

	// Skip offline: the offline toast, no queue, the occurrence stays
	const series = await makeItem({
		title: `Blind C15 series ${P}`,
		date: '2031-03-12',
		time: '09:00',
		rrule: 'FREQ=DAILY;COUNT=3',
	});
	const occ = `${series.id}@2031-03-13`;
	await page.goto(`/item/${occ}`);
	await page.context().setOffline(true);
	await page.getByRole('button', { name: 'Postpone ▾' }).click();
	await page.getByRole('group', { name: 'Postpone' }).getByRole('button', { name: 'Skip this one' }).click();
	await expect(page.locator('.toast')).toContainText("You're offline. Not saved.");
	expect(await page.evaluate(() => localStorage.getItem('lt_action_queue') ?? '')).not.toContain('/skip');
	await page.context().setOffline(false);
	await expect.poll(async () => (await getItem(occ)).status).toBe(200);
});
