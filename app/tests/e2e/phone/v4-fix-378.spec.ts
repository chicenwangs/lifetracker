// #378 (S2, phone web): a rapid tap after "Save note" reached the Today row under the closed Add sheet and
// deleted an unrelated item. D-V4-39: one 250 ms touch shield from the sheet's close, Undo toast exempt.
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { bottomBar, expectTargets48, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let P = '';
const DAY = '2030-09-10'; // unused by other specs, far from today
const NEXT = '2030-09-11';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	// service workers off: the failed-save test needs the POST on the page for page.route (as keepretry.spec.ts)
	page = await (
		await browser.newContext({
			serviceWorkers: 'block',
			viewport,
			isMobile,
			hasTouch,
			userAgent,
			deviceScaleFactor,
		})
	).newPage();
	await signIn(page);
	P = info.project.name;
});
test.afterAll(() => page.context().close());

const make = (title: string, time: string) =>
	page.evaluate(
		async ([t, tm, d]) => {
			const r = await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, date: d, time: tm }) }); // prettier-ignore
			return ((await r.json()) as { item: { id: string } }).item.id;
		},
		[title, time, DAY],
	);

const item = (id: string) =>
	page.evaluate(
		async (i) => ((await (await fetch(`/api/items/${i}`)).json()) as { item: { status: string } }).item,
		id,
	);

/** every own item/block on the day, as plain values: the burst must leave all of them alone */
const ownRows = () =>
	page.evaluate(
		async ([from, to]) => {
			const cal = (await (await fetch(`/api/calendar?from=${from}&to=${to}`)).json()) as {
				items: {
					id: string;
					status: string;
					date: string | null;
					time: string | null;
					editable: boolean;
					theirs?: boolean;
				}[];
				blocks: {
					id: string;
					status: string;
					startAt: string;
					endAt: string;
					editable: boolean;
					theirs?: boolean;
				}[];
			};
			const mine = (r: { editable: boolean; theirs?: boolean }) => r.editable && !r.theirs;
			return {
				items: cal.items
					.filter(mine)
					.map((i) => [i.id, i.status, i.date, i.time])
					.sort(),
				blocks: cal.blocks
					.filter(mine)
					.map((b) => [b.id, b.status, b.startAt, b.endAt])
					.sort(),
			};
		},
		[DAY, NEXT],
	);

const notesWith = (text: string) =>
	page.evaluate(
		async (q) =>
			(
				(await (await fetch(`/api/keep/notes?scope=active&q=${encodeURIComponent(q)}`)).json()) as {
					notes: { id: string; body: string }[];
				}
			).notes,
		text,
	);

/** Today -> + -> Quick note */
async function noteSheet() {
	await bottomBar(page).locator('button.add').click();
	const sheet = page.getByRole('dialog', { name: 'Add' });
	await expect(sheet).toBeVisible();
	await sheet.getByRole('tab', { name: 'Quick note' }).click();
	await expect(sheet.getByRole('textbox', { name: 'Note' })).toBeVisible();
	return sheet;
}

const centreOf = async (el: Locator) => {
	const b = (await el.boundingBox())!;
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const tap = (p: { x: number; y: number }) => page.touchscreen.tap(Math.round(p.x), Math.round(p.y));
/** three taps 30 ms apart at one point (the #378 repro is 20-60 ms) */
const burst = async (p: { x: number; y: number }) => {
	for (let i = 0; i < 3; i++) {
		if (i) await page.waitForTimeout(30);
		await tap(p);
	}
};

test('C1 one note per burst · C2 no unrelated row changes · C4 one submission = one object', async () => {
	const row = `F378 row ${P}`;
	await make(row, '08:00');
	await make(`F378 second ${P}`, '09:00');
	await page.goto(`/today?d=${DAY}`);
	const before = await ownRows();
	const text = `F378 C1 ${P} ${Date.now()}`;
	const posts: string[] = [];
	const onReq = (r: Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/keep/notes')
			posts.push(r.postData() ?? '');
	};
	page.on('request', onReq);
	try {
		const sheet = await noteSheet();
		await sheet.getByRole('textbox', { name: 'Note' }).fill(text);
		const save = await centreOf(sheet.getByRole('button', { name: 'Save note' }));
		await burst(save);
		await page.waitForTimeout(90); // the check's tap at 200 ms after Save
		await tap(save);
		await expect(sheet).toBeHidden();
		// C1: one note, not one per tap
		await expect.poll(async () => (await notesWith(text)).length).toBe(1);
		// C4: one POST, one object
		expect(posts).toHaveLength(1);
		expect(posts[0]).toContain(text);
		// C2: every other row is untouched; no toast names one; no action sheet
		expect(await ownRows()).toEqual(before);
		await expect(page.locator('.toast')).toContainText('Note saved');
		await expect(page.locator('.toast')).not.toContainText(row);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	} finally {
		page.off('request', onReq);
	}
});

test('C3 shield, then release: nothing under the sheet answers during the burst, ⋯ works after ~300 ms', async () => {
	const title = `F378 shield ${P}`;
	const id = await make(title, '07:00'); // first row of the day: the wheel rests on it before and after the save
	await page.goto(`/today?d=${DAY}`);
	const more = page.getByRole('button', { name: `Actions for ${title}` });
	await expect(more).toBeVisible();
	const target = await centreOf(more);
	const text = `F378 C3 ${P} ${Date.now()}`;
	const sheet = await noteSheet();
	await sheet.getByRole('textbox', { name: 'Note' }).fill(text);
	const save = await centreOf(sheet.getByRole('button', { name: 'Save note' }));
	await burst(save);
	// the sheet's fade keeps the old dialog in the DOM ~190 ms after close: wait for the row to be exposed,
	// then tap it at once, inside the 250 ms shield (the shield starts at close, before the fade ends)
	await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), undefined, { polling: 'raf' });
	await tap(target);
	await page.waitForTimeout(100);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(new URL(page.url()).pathname).toBe('/today');
	expect((await item(id)).status).toBe('todo');
	// after the window: the same tap opens the row's actions
	await page.waitForTimeout(300);
	await tap(target);
	const actions = page.getByRole('dialog', { name: `Actions for ${title}` });
	await expect(actions).toBeVisible();
	await page.goBack();
	await expect(actions).toBeHidden();
});

test('C6 Undo still works on a deliberate delete after the shield', async () => {
	const title = `F378 undo ${P}`;
	await make(title, '12:00');
	await page.goto(`/today?d=${DAY}`);
	const row = page.getByRole('group', { name: title, exact: true });
	await expect(row).toBeVisible();
	await page.getByRole('button', { name: `Actions for ${title}` }).click();
	const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
	await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText(`Deleted "${title}"`);
	await expect(row).toBeHidden();
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(row).toBeVisible();
});

test('C5 phone path: shared sheet, 48 dp, Back closes it, no desktop wording', async () => {
	await page.goto(`/today?d=${DAY}`);
	const sheet = await noteSheet();
	await expect(sheet).toHaveAttribute('aria-modal', 'true');
	for (const name of ['Save note', 'Close']) {
		const b = (await sheet.getByRole('button', { name, exact: true }).boundingBox())!;
		expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(48);
	}
	await expectTargets48(page);
	await noDesktopHints(page);
	await page.goBack();
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');
});

test('C7 states: empty note keeps Save note disabled and posts nothing', async () => {
	await page.goto(`/today?d=${DAY}`);
	const posts: string[] = [];
	const onReq = (r: Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/keep/notes') posts.push(r.url());
	};
	page.on('request', onReq);
	try {
		const sheet = await noteSheet();
		const save = sheet.getByRole('button', { name: 'Save note' });
		await expect(save).toBeDisabled();
		await tap(await centreOf(save)); // a tap on the disabled button does nothing
		await page.waitForTimeout(100);
		expect(posts).toHaveLength(0);
		await expect(sheet).toBeVisible();
	} finally {
		page.off('request', onReq);
	}
	await page.goBack();
});

test('C7 states: a failed save keeps the text, shows the error and creates nothing', async () => {
	await page.goto(`/today?d=${DAY}`);
	const text = `F378 C7 fail ${P} ${Date.now()}`;
	let failing = true;
	await page.route('**/api/keep/notes**', (route) =>
		failing && route.request().method() === 'POST'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'fail', message: 'Could not save' } }),
				})
			: route.continue(),
	);
	try {
		const sheet = await noteSheet();
		const box = sheet.getByRole('textbox', { name: 'Note' });
		await box.fill(text);
		await sheet.getByRole('button', { name: 'Save note' }).click();
		await expect(page.locator('.toast[role="alert"]')).toContainText('Could not save');
		await expect(sheet).toBeVisible();
		await expect(box).toHaveValue(text);
		failing = false;
		await expect.poll(async () => (await notesWith(text)).length).toBe(0);
	} finally {
		await page.unroute('**/api/keep/notes**');
	}
	await page.goBack();
});

test('C7 states: a queued offline save closes with "Note saved · Waiting to sync"', async () => {
	await page.goto(`/today?d=${DAY}`);
	const text = `F378 C7 offline ${P} ${Date.now()}`;
	const sheet = await noteSheet();
	await sheet.getByRole('textbox', { name: 'Note' }).fill(text);
	await page.context().setOffline(true);
	try {
		await sheet.getByRole('button', { name: 'Save note' }).click();
		await expect(page.locator('.toast')).toContainText('Note saved · Waiting to sync');
		await expect(sheet).toBeHidden();
	} finally {
		await page.context().setOffline(false);
	}
});
