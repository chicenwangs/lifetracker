// Blind tests for card F-378 (#378): the Add sheet closes under a finger that is still tapping; a small
// tap shield absorbs stray pointer input for 250 ms. Written from the Done-when lines only (C1–C8).
// C1–C4 use real touch taps at the "Save note" point, so they run on the phone project (412×915) only.
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { bottomBar, noDesktopHints, signIn, swipe } from './helpers';

const PW = 'good pass phrase';
const DAY = '2030-06-18'; // a fixed Tuesday, away from the days other specs use
const phoneOnly = () =>
	test.skip(test.info().project.name !== 'phone', 'coordinate burst: phone project, 412×915 (card C1)');

let page: Page;
let P = '';
let A = '';
let B = '';
let AId = '';
let seq = 0;

/** unique text per test, so a second identical object can never hide in the count */
const tag = (what: string) => `Blind 378 ${what} ${P} ${++seq}`;
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

// not serial: one failing check must not hide the others (workers = 1, so order is the file's)
test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	P = info.project.name;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	A = `F378 row A ${P}`;
	B = `F378 row B ${P}`;
	const ids = await page.evaluate(
		async ([a, b, day]) => {
			const post = async (path: string, body: unknown) =>
				(await (await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()) as { item: { id: string } }; // prettier-ignore
			const ia = (await post('/api/items', { title: a, date: day, time: '09:00' })).item.id;
			const ib = (await post('/api/items', { title: b, date: day, time: '10:00' })).item.id;
			const at = (h: number) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00+08:00`).toISOString().slice(0, 19) + 'Z'; // prettier-ignore
			await post('/api/blocks', { label: `${a} block`, startAt: at(11), endAt: at(12) });
			return { ia, ib };
		},
		[A, B, DAY],
	);
	AId = ids.ia;
});
test.afterAll(() => page.context().close());

// ---------- API helpers (behaviour is read back from the server, not from the DOM) ----------

const notes = (q: string) =>
	page
		.evaluate(async (query) => {
			const r = await fetch(`/api/keep/notes?scope=active&q=${encodeURIComponent(query)}`);
			return (await r.json()) as { notes: { id: string; title: string; body: string }[] };
		}, q)
		.then((r) => r.notes);

const noteCount = () =>
	page
		.evaluate(
			async () => (await (await fetch('/api/keep/notes?scope=active')).json()) as { notes: unknown[] },
		)
		.then((r) => r.notes.length);

type ItemRow = { id: string; status: string; date: string | null; time: string | null; theirs?: boolean };
type BlockRow = {
	id: string;
	status: string;
	startAt: string;
	endAt: string;
	theirs?: boolean;
};
const calendar = () =>
	page.evaluate(
		async (url) =>
			(await (await fetch(url)).json()) as {
				items: ItemRow[];
				blocks: BlockRow[];
			},
		`/api/calendar?from=${DAY}&to=${nextDay(DAY)}`,
	);

/** every own item/block on Today: id, status, date, time (C2) */
const ownRows = async () => {
	const cal = await calendar();
	const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
	return {
		items: cal.items
			.filter((i) => !i.theirs)
			.map((i) => ({ id: i.id, status: i.status, date: i.date, time: i.time }))
			.sort(byId),
		blocks: cal.blocks
			.filter((b) => !b.theirs)
			.map((b) => ({ id: b.id, status: b.status, startAt: b.startAt, endAt: b.endAt }))
			.sort(byId),
	};
};

const itemStatus = (id: string) =>
	page.evaluate(async (i) => {
		const r = await fetch(`/api/items/${i}`);
		return r.status === 200 ? ((await r.json()) as { item: { status: string } }).item.status : 'gone';
	}, id);

const item = (id: string) =>
	page.evaluate(
		async (i) =>
			(
				(await (await fetch(`/api/items/${i}`)).json()) as {
					item: { title: string; date: string; time: string; status: string };
				}
			).item,
		id,
	);

// ---------- sheet + touch helpers ----------

/** opens the Add sheet → Quick note on the page already loaded (the bar's +) */
const openSheetHere = async () => {
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add' });
	await expect(sheet).toBeVisible();
	await page.waitForTimeout(300); // the sheet grows out of the + (#93)
	await sheet.getByRole('tab', { name: 'Quick note' }).click();
	return sheet;
};

/** Today → the bar's + → Quick note */
const openNoteSheet = async () => {
	await page.goto(`/today?d=${DAY}`);
	return openSheetHere();
};

const saveCentre = async (sheet: Locator) => {
	const b = (await sheet.getByRole('button', { name: 'Save note' }).boundingBox())!;
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** three real touch taps at the same screen point, 20–60 ms apart */
const burst = async (x: number, y: number) => {
	await page.touchscreen.tap(x, y);
	await page.waitForTimeout(30);
	await page.touchscreen.tap(x, y);
	await page.waitForTimeout(30);
	await page.touchscreen.tap(x, y);
};

/** the shield adds no visible element and no copy of its own */
const shieldArtifacts = () =>
	page.evaluate(() => {
		const out: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>('*')) {
			if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
			const mark = `${el.id} ${String(el.className)} ${el.getAttribute('aria-label') ?? ''}`;
			if (/shield|tap again|please wait/i.test(mark)) out.push(mark.trim().slice(0, 60));
		}
		return out;
	});

// ---------- checks ----------

test('C1 one note per burst: 3 taps 20–60 ms apart make one note and close the sheet', async () => {
	phoneOnly();
	const body = tag('one note');
	const sheet = await openNoteSheet();
	await sheet.getByLabel('Note').fill(body);
	await expect(sheet.getByRole('button', { name: 'Save note' })).toBeEnabled();
	const { x, y } = await saveCentre(sheet);
	await burst(x, y);
	await expect(sheet).toBeHidden(); // closed by the first tap
	await expect.poll(async () => (await notes(body)).length).toBe(1);
	await page.waitForTimeout(600); // a late second POST would have landed by now
	const found = await notes(body);
	expect(found).toHaveLength(1);
	expect(found[0].body).toBe(body);
});

test('C2 no unrelated row changes: only the one new note, no toast names a row, no action sheet', async () => {
	phoneOnly();
	const body = tag('no row change');
	const before = await ownRows();
	expect(before.items.length).toBeGreaterThanOrEqual(2); // A and B are on Today
	expect(before.blocks.length).toBeGreaterThanOrEqual(1);
	const sheet = await openNoteSheet();
	await sheet.getByLabel('Note').fill(body);
	const { x, y } = await saveCentre(sheet);
	await burst(x, y);
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('dialog')).toHaveCount(0); // no action sheet
	expect(await ownRows()).toEqual(before); // id, status, date, time all unchanged
	expect(new URL(page.url()).pathname).toBe('/today');
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Note saved');
	await expect(toast).not.toContainText(/Deleted "|Not started: "|Started: "|Done: "/);
	await expect(toast).not.toContainText(A);
	await expect(toast).not.toContainText(B);
});

test('C3 shield absorbs the burst and a 200 ms tap, then releases by itself (invisible)', async () => {
	phoneOnly();
	const body = tag('shield');
	const before = await ownRows();
	// On 412×915 the Save point sits below the timeline card, so a stray tap there hits blank space.
	// To prove the shield really absorbs row input, also aim a stray tap at a row's ⋯ as soon as the
	// closing scrim uncovers it (still inside the 250 ms window), then tap that same ⋯ after release.
	await page.goto(`/today?d=${DAY}`);
	const moreB = page.getByRole('button', { name: `Actions for ${B}`, exact: true });
	const bb = (await moreB.boundingBox())!;
	const mx = bb.x + bb.width / 2;
	const my = bb.y + bb.height / 2;
	const sheet = await openSheetHere();
	await sheet.getByLabel('Note').fill(body);
	const { x, y } = await saveCentre(sheet);
	const saved = page.waitForResponse(
		(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/keep/notes',
	);
	const t0 = Date.now();
	await burst(x, y);
	await saved; // saveNote() calls close() right after this reply: the shield starts here
	const tClose = Date.now();
	// the closing scrim covers the page for ~180 ms; probe the ⋯ the moment it is uncovered
	await expect
		.poll(
			() =>
				page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('button.more'), {
					x: mx,
					y: my,
				}),
			{ intervals: [5, 5, 10, 10, 20], timeout: 4000 },
		)
		.toBe(true);
	const tProbe = Date.now();
	await page.touchscreen.tap(mx, my); // a real row action, inside the shield window
	// the stray tap at the Save point (~200 ms after the save tap), also inside the window
	const wait = 200 - (Date.now() - t0);
	if (wait > 0) await page.waitForTimeout(wait);
	await page.touchscreen.tap(x, y);
	// nothing underneath activated: no action sheet, no status change, no navigation
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(new URL(page.url()).pathname).toBe('/today');
	expect(tProbe - tClose).toBeLessThan(250); // the probe really was inside the window
	expect(await ownRows()).toEqual(before);
	expect(await shieldArtifacts()).toEqual([]);
	await expect(sheet).toBeHidden();
	// the release probe: ~300 ms after the close the same row's ⋯ answers a tap again
	await page.waitForTimeout(320);
	await moreB.tap();
	const actions = page.getByRole('dialog', { name: `Actions for ${B}` });
	await expect(actions).toBeVisible();
	await actions.getByRole('button', { name: 'Close', exact: true }).click();
});

test('C4 one submission = one object: one POST, one new note', async () => {
	phoneOnly();
	const body = tag('one post');
	const before = await noteCount();
	const posts: Request[] = [];
	const onReq = (r: Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/keep/notes') posts.push(r);
	};
	page.on('request', onReq);
	await page.route('**/api/keep/notes', async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await new Promise((done) => setTimeout(done, 150)); // taps 2 and 3 arrive before the close (busy guard)
		await route.continue();
	});
	try {
		const sheet = await openNoteSheet();
		await sheet.getByLabel('Note').fill(body);
		const { x, y } = await saveCentre(sheet);
		await burst(x, y);
		await expect(sheet).toBeHidden();
	} finally {
		page.off('request', onReq);
		await page.unroute('**/api/keep/notes');
	}
	expect(posts).toHaveLength(1);
	expect(await noteCount()).toBe(before + 1);
	expect(await notes(body)).toHaveLength(1);
});

test('C5 phone path: the shared sheet, 48 dp, Back closes the sheet, no desktop wording, no shield element', async () => {
	const sheet = await openNoteSheet();
	await expect(sheet).toHaveAttribute('aria-modal', 'true');
	await expect(page.getByRole('button', { name: 'Expand sheet' })).toBeVisible(); // the shared BottomSheet
	const save = (await sheet.getByRole('button', { name: 'Save note' }).boundingBox())!;
	const close = (await sheet.getByRole('button', { name: 'Close', exact: true }).boundingBox())!;
	expect(Math.min(save.width, save.height)).toBeGreaterThanOrEqual(48);
	expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(48);
	await noDesktopHints(page); // the open sheet
	await page.goBack();
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');
	await noDesktopHints(page); // Today
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(await shieldArtifacts()).toEqual([]);
});

test('C6 undo: note creation has none; a deliberate delete after the shield still undoes', async () => {
	const body = tag('undo note');
	const sheet = await openNoteSheet();
	await sheet.getByLabel('Note').fill(body);
	await sheet.getByRole('button', { name: 'Save note' }).tap();
	await expect(sheet).toBeHidden();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Note saved');
	await expect(toast.getByRole('button', { name: 'Undo' })).toHaveCount(0); // not journaled today
	await page.waitForTimeout(350); // the shield has released
	const row = page.getByRole('group', { name: A, exact: true });
	await swipe(page, row, 'left');
	await expect(toast).toContainText(`Deleted "${A}"`);
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	await expect.poll(() => itemStatus(AId)).toBe('gone');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(row).toBeVisible();
	await expect.poll(() => itemStatus(AId)).toBe('todo');
	expect(await item(AId)).toMatchObject({ title: A, date: DAY, time: '09:00' });
});

test('C7 states: empty = disabled, failed save keeps the text and the sheet, offline queues and closes', async () => {
	// empty note: Save stays disabled and creates nothing (no shield needed)
	let sheet = await openNoteSheet();
	const save = () => sheet.getByRole('button', { name: 'Save note' });
	await expect(save()).toBeDisabled();
	const emptyBox = (await save().boundingBox())!;
	let posts = 0;
	const onReq = (r: Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/keep/notes') posts++;
	};
	page.on('request', onReq);
	const before = await noteCount();
	await page.touchscreen.tap(emptyBox.x + emptyBox.width / 2, emptyBox.y + emptyBox.height / 2);
	await page.waitForTimeout(250);
	page.off('request', onReq);
	expect(posts).toBe(0);
	expect(await noteCount()).toBe(before);
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(sheet).toBeHidden();

	// failed save: text stays, the error toast is role=alert, sheet open, no note
	sheet = await openNoteSheet();
	const failed = tag('failed');
	await sheet.getByLabel('Note').fill(failed);
	await page.route('**/api/keep/notes', async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'boom', message: 'Blind 378 save failed' } }),
		});
	});
	try {
		await save().tap();
		await expect(page.locator('.toast[role="alert"]')).toContainText('Blind 378 save failed');
		await expect(sheet.getByLabel('Note')).toHaveValue(failed);
		await expect(sheet).toBeVisible();
		await page.waitForTimeout(200);
		expect(await notes(failed)).toHaveLength(0);
	} finally {
		await page.unroute('**/api/keep/notes');
	}
	await sheet.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(sheet).toBeHidden();

	// offline: the queued save still closes with "Note saved · Waiting to sync"
	sheet = await openNoteSheet();
	const offline = tag('offline');
	await sheet.getByLabel('Note').fill(offline);
	await page.context().setOffline(true);
	try {
		await save().tap();
		await expect(page.locator('.toast')).toContainText('Note saved · Waiting to sync');
		await expect(sheet).toBeHidden();
	} finally {
		await page.context().setOffline(false);
	}
	// back online it flushes, so nothing was lost (the card only claims the toast + close)
	await expect.poll(async () => (await notes(offline)).length, { timeout: 15_000 }).toBe(1);
});

test('C8 permission: my note goes to my own Keep; a partner row stays read-only through the burst', async ({
	browser,
}) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = test.info().project.use;
	const partnerCtx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	const p = await partnerCtx.newPage();
	try {
		// C8 line 1 (no server route / level() / need() change) is a diff fact: `git diff
		// origin/main...HEAD -- app/src` lists only tapShield.ts + MobileAdd.svelte. The rest is behaviour.

		// open sign-up (admin) and create the partner account
		await page.goto('/settings/users');
		await page.locator('form.mode').locator('input[name="open"][value="1"]').check();
		await page.locator('form.mode').getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

		const username = `blind378${P === 'phone' ? 'a' : 'b'}`;
		await p.goto('/signup');
		await p.fill('#nu', username);
		await p.fill('#dn', 'Blind Partner');
		await p.fill('#np', `${PW} 2`);
		await p.fill('#cp', `${PW} 2`);
		await p.getByRole('button', { name: 'Create account' }).click();
		await p.waitForURL((u) => new URL(u).pathname === '/');
		const skip = p.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();

		// swap codes: the partner shares their calendar with me
		await p.goto('/settings/sharing');
		await p.getByRole('button', { name: 'Make a code' }).click();
		const code = (await p.getByLabel('Your share code').textContent())!.trim();
		expect(code).toMatch(/^LT-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		await page.goto('/settings/sharing');
		await page.getByLabel('Code from the other person').fill(code);
		await page.getByRole('button', { name: 'Add calendar' }).click();
		await expect(page.getByText("You can now see Blind Partner's calendar on Home and Week.")).toBeVisible();

		// one partner item on Today (Event = visible under the default code)
		const partnerTitle = `F378 partner row ${P}`;
		const partnerItemId = await p.evaluate(
			async ([day, title]) => {
				const r = await fetch('/api/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ title, date: day, time: '14:00', type: 'Event' }),
				});
				return ((await r.json()) as { item: { id: string } }).item.id;
			},
			[DAY, partnerTitle],
		);

		await page.goto(`/today?d=${DAY}`);
		const row = page.getByRole('group', { name: partnerTitle, exact: true });
		await expect(row).toBeVisible();
		await expect(row.locator('.who')).toHaveText('B'); // their badge, dashed read-only row
		await expect(row.locator('button.sq')).toHaveCount(0); // no status square
		await expect(row.getByRole('button', { name: `Actions for ${partnerTitle}` })).toHaveCount(0); // no ⋯
		await expect(row.getByRole('button', { name: partnerTitle, exact: true })).toBeDisabled();

		const partnerStatus = () =>
			p.evaluate(async (id) => {
				const r = await fetch(`/api/items/${id}`);
				return r.status === 200 ? ((await r.json()) as { item: { status: string } }).item.status : 'gone';
			}, partnerItemId);
		const before = await partnerStatus();

		// my note exists in my Keep only, and the burst does not unlock their row
		const body = tag('own keep');
		const sheet = await openNoteSheet();
		await sheet.getByLabel('Note').fill(body);
		await sheet.getByRole('button', { name: 'Save note' }).tap();
		await expect(sheet).toBeHidden();
		await expect.poll(async () => (await notes(body)).length).toBe(1);
		const partnerSees = await p.evaluate(async (q) => {
			const r = await fetch(`/api/keep/notes?scope=active&q=${encodeURIComponent(q)}`);
			return ((await r.json()) as { notes: unknown[] }).notes.length;
		}, body);
		expect(partnerSees).toBe(0);
		expect(await partnerStatus()).toBe(before);
		await expect(row.locator('button.sq')).toHaveCount(0);
		await expect(row.getByRole('button', { name: `Actions for ${partnerTitle}` })).toHaveCount(0);
	} finally {
		await partnerCtx.close();
	}
});
