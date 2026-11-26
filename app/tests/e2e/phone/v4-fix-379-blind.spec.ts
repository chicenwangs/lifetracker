// Blind tests for card F-379 (#379): a burst of taps on a Today status square changes one row once.
// Written from the Done-when lines only (C1–C10). The coordinate burst, the request count and the 250 ms
// release probe need the 412×915 phone project; phone-landscape reruns the one-transition / no-unrelated-change
// checks (C1, C2) with a single tap, because row positions differ there (card §Tests).
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { expectTappable, expectTargets48, noDesktopHints, signIn } from './helpers';

let page: Page;
let P = '';
let RUN = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	P = info.project.name;
	RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; // unique rows per repeat
	page = await (
		await browser.newContext({
			viewport,
			isMobile,
			hasTouch,
			userAgent,
			deviceScaleFactor,
			serviceWorkers: 'block', // page.route cannot fail a request the service worker handles
		})
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

const phoneOnly = () =>
	test.skip(P !== 'phone', 'coordinate burst / timing / one-project check (card §Tests)');

const D = {
	c1: '2032-02-10',
	c2: '2032-02-17',
	c3: '2032-02-24',
	c4: '2032-03-02',
	c5: '2032-03-09',
	c6: '2032-03-16',
	fail: '2032-03-23',
	loading: '2032-03-30',
	empty: '2024-02-20', // before the shared DB's endless daily series starts (2030-06-10), so it stays empty
	home: '2032-04-13',
	sheet: '2032-04-20',
	share: '2032-04-27',
	desk: '2032-05-04',
};

// ---------- API helpers: behaviour is read back from the server, not from the DOM ----------

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const mkItem = (title: string, date: string, time: string, rrule?: string) =>
	page.evaluate(
		async ([t, d, tm, r]) => {
			const body: Record<string, unknown> = { title: t, date: d, time: tm };
			if (r) body.rrule = r;
			const res = await fetch('/api/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});
			return ((await res.json()) as { item: { id: string } }).item.id;
		},
		[title, date, time, rrule ?? ''] as [string, string, string, string],
	);

const mkBlock = (label: string, day: string, hour: number) =>
	page.evaluate(
		async ([l, d, h]) => {
			const at = (hh: number) =>
				new Date(`${d}T${String(hh).padStart(2, '0')}:00:00+08:00`).toISOString().slice(0, 19) + 'Z';
			const res = await fetch('/api/blocks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label: l, startAt: at(h), endAt: at(h + 1) }),
			});
			return ((await res.json()) as { block: { id: string } }).block.id;
		},
		[label, day, hour] as [string, string, number],
	);

const itemStatus = (id: string) =>
	page.evaluate(async (i) => {
		const r = await fetch(`/api/items/${encodeURIComponent(i)}`);
		return r.status === 200 ? ((await r.json()) as { item: { status: string } }).item.status : 'gone';
	}, id);

type Row = { id: string; title: string; status: string; theirs?: boolean };
type BlockRow = { id: string; label: string; status: string; theirs?: boolean };
const calRows = (day: string) =>
	page.evaluate(
		async ([d, to]) =>
			(await (await fetch(`/api/calendar?from=${d}&to=${to}`)).json()) as {
				items: Row[];
				blocks: BlockRow[];
			},
		[day, nextDay(day)] as [string, string],
	);

const blockStatus = async (id: string, day: string) =>
	(await calRows(day)).blocks.find((b) => b.id === id)?.status ?? 'gone';

// ---------- page + touch helpers ----------

const row = (title: string) => page.getByRole('group', { name: title, exact: true });
const square = (title: string) => row(title).locator('button.sq').first();

/** scroll the square into view, then its centre (the finger can only touch what is on screen) */
async function centreOf(el: Locator) {
	await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
	const b = await el.boundingBox();
	if (!b) throw new Error('status square is not visible');
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** three real touch taps at one point, 20–60 ms apart */
async function burst3(c: { x: number; y: number }) {
	await page.touchscreen.tap(c.x, c.y);
	await page.waitForTimeout(30);
	await page.touchscreen.tap(c.x, c.y);
	await page.waitForTimeout(30);
	await page.touchscreen.tap(c.x, c.y);
}

/** the shield draws nothing and says nothing: any visible mark of it is a defect */
const shieldArtifacts = () =>
	page.evaluate(() => {
		const out: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>('*')) {
			if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
			const mark = `${el.id} ${String(el.className)} ${el.getAttribute('aria-label') ?? ''} ${el.textContent?.slice(0, 40) ?? ''}`; // prettier-ignore
			if (/shield|tap again|please wait/i.test(mark)) out.push(mark.trim().slice(0, 60));
		}
		return out;
	});

const toast = () => page.locator('.toast');
const waitTo = async (at: number) => {
	const ms = at - Date.now();
	if (ms > 0) await page.waitForTimeout(ms);
};

// ---------- checks ----------

test('C1 one transition per burst: the target goes todo → doing once and is not done', async () => {
	const day = D.c1;
	const other = `F379 C1 other ${P} ${RUN}`;
	const title = `F379 C1 target ${P} ${RUN}`;
	await mkItem(other, day, '09:00');
	const id = await mkItem(title, day, '10:00');

	await page.goto(`/today?d=${day}`);
	const sq = square(title);
	await expect(sq).toBeVisible();
	const c = await centreOf(sq);
	if (P === 'phone') await burst3(c);
	else await sq.tap(); // landscape: one-transition check only, no coordinate burst (card §Tests)

	await expect(toast()).toContainText(`Started: "${title}"`);
	await expect.poll(() => itemStatus(id)).toBe('doing');
	await page.waitForTimeout(350); // a late 2nd/3rd cycle would have landed by now
	expect(await itemStatus(id)).toBe('doing'); // exactly one step: never done
});

test('C2 no unrelated row changes: the other row keeps todo, no toast names it, no focus', async () => {
	const day = D.c2;
	const other = `F379 C2 other ${P} ${RUN}`;
	const title = `F379 C2 target ${P} ${RUN}`;
	const otherId = await mkItem(other, day, '09:00');
	const id = await mkItem(title, day, '10:00');

	await page.goto(`/today?d=${day}`);
	const otherSq = square(other);
	await expect(otherSq).toHaveAttribute('aria-label', /Not started/);
	const otherRows = (await calRows(day)).items
		.filter((i) => !i.theirs && i.id !== id) // the target may change; every other row may not
		.map((i) => `${i.id}:${i.status}`)
		.sort();
	const c = await centreOf(square(title));
	if (P === 'phone') await burst3(c);
	else await square(title).tap();

	await expect(toast()).toContainText(`Started: "${title}"`);
	await expect(toast()).not.toContainText(other); // no toast names the other row's title
	expect(await itemStatus(id)).toBe('doing');
	expect(await itemStatus(otherId)).toBe('todo'); // API
	await expect(otherSq).toHaveAttribute('aria-label', /Not started/); // UI
	const after = (await calRows(day)).items
		.filter((i) => !i.theirs && i.id !== id)
		.map((i) => `${i.id}:${i.status}`)
		.sort();
	expect(after).toEqual(otherRows); // no other row changed at all
	expect(
		await page.evaluate(
			() => document.activeElement?.closest('[role="group"]')?.getAttribute('aria-label') ?? '',
		),
	).not.toBe(other); // its status square is not focused
});

test('C3 one request: the burst sends exactly one POST /cycle and no queued PATCH', async () => {
	phoneOnly();
	const day = D.c3;
	const other = `F379 C3 other ${P} ${RUN}`;
	const title = `F379 C3 target ${P} ${RUN}`;
	await mkItem(other, day, '09:00');
	const id = await mkItem(title, day, '10:00');

	await page.goto(`/today?d=${day}`);
	const c = await centreOf(square(title));
	const cycles: string[] = [];
	const patches: string[] = [];
	const onReq = (r: Request) => {
		const p = new URL(r.url()).pathname;
		if (r.method() === 'POST' && p.endsWith('/cycle')) cycles.push(p);
		if (r.method() === 'PATCH') patches.push(p);
	};
	page.on('request', onReq);
	try {
		await burst3(c);
		await expect.poll(() => cycles.length).toBe(1);
		await page.waitForTimeout(350);
	} finally {
		page.off('request', onReq);
	}
	expect(cycles).toEqual([`/api/items/${id}/cycle`]); // no /cycle for any other row
	expect(patches).toEqual([]); // nothing queued
});

test('C4 shield, then release: a tap at 200 ms does nothing, ~300 ms advances again, no overlay', async () => {
	phoneOnly();
	const day = D.c4;
	const title = `F379 C4 target ${P} ${RUN}`;
	const id = await mkItem(title, day, '10:00');

	await page.goto(`/today?d=${day}`);
	const c = await centreOf(square(title));
	const cycles: string[] = [];
	const onReq = (r: Request) => {
		const p = new URL(r.url()).pathname;
		if (r.method() === 'POST' && p.endsWith('/cycle')) cycles.push(p);
	};
	page.on('request', onReq);
	try {
		const t0 = Date.now();
		await page.touchscreen.tap(c.x, c.y); // raises the shield for 250 ms
		await waitTo(t0 + 200);
		await page.touchscreen.tap(c.x, c.y); // inside the shield: nothing
		await page.waitForTimeout(120);
		expect(cycles).toHaveLength(1);
		await expect.poll(() => itemStatus(id)).toBe('doing');
		await waitTo(t0 + 330);
		await page.touchscreen.tap(c.x, c.y); // released by itself: advances again
		await expect.poll(() => itemStatus(id)).toBe('done');
		expect(cycles).toHaveLength(2);
	} finally {
		page.off('request', onReq);
	}
	await expect(toast()).toContainText(`Done: "${title}"`);
	expect(await shieldArtifacts()).toEqual([]); // no visible overlay or copy
});

test('C5 undo: the toast Undo restores the target to todo after the shield expires', async () => {
	phoneOnly();
	const day = D.c5;
	const title = `F379 C5 target ${P} ${RUN}`;
	const id = await mkItem(title, day, '10:00');

	await page.goto(`/today?d=${day}`);
	await square(title).tap();
	await expect(toast()).toContainText(`Started: "${title}"`);
	await expect(toast().getByRole('button', { name: 'Undo' })).toBeVisible();
	await expectTappable(toast().getByRole('button', { name: 'Undo' })); // reachable
	await page.waitForTimeout(350); // the shield has gone
	await toast().getByRole('button', { name: 'Undo' }).tap();

	await expect.poll(() => itemStatus(id)).toBe('todo');
	await expect(square(title)).toHaveAttribute('aria-label', /Not started/); // the list shows it
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await noDesktopHints(page); // no Ctrl+Z wording on phone
});

test('C6 phone path: 48 dp square, ⋯ still works, Back unchanged, no extra layer', async () => {
	phoneOnly();
	const day = D.c6;
	const title = `F379 C6 target ${P} ${RUN}`;
	const id = await mkItem(title, day, '10:00');

	await page.goto('/more');
	await page.goto(`/today?d=${day}`);
	const sq = square(title);
	await sq.tap();
	await expect.poll(() => itemStatus(id)).toBe('doing');
	await expect(page.getByRole('dialog')).toHaveCount(0); // no sheet/layer from the tick

	const hit = await sq.evaluate((el) => {
		const cs = getComputedStyle(el, '::after');
		const r = el.getBoundingClientRect();
		return {
			w: Math.max(r.width, parseFloat(cs.width) || 0),
			h: Math.max(r.height, parseFloat(cs.height) || 0),
		};
	});
	expect(Math.round(hit.w)).toBeGreaterThanOrEqual(48); // touch hit area ≥ 48 dp
	expect(Math.round(hit.h)).toBeGreaterThanOrEqual(48);
	await expectTargets48(page);

	await page.goBack(); // Back unchanged: the tick added no history entry or layer
	expect(new URL(page.url()).pathname).toBe('/more');

	await page.goto(`/today?d=${day}`);
	await page.waitForTimeout(320); // shield released
	await page.getByRole('button', { name: `Actions for ${title}` }).tap(); // the ⋯ path still works
	const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
	await expect(sheet).toBeHidden();
	await noDesktopHints(page);
});

test('C7 states: empty Today has no square, a failed cycle reverts, loading keeps the server list', async () => {
	phoneOnly();
	// empty: "Nothing planned.", no square, no shield absorbing the one action. 2024-02-20 is before every
	// repeating series in the shared E2E DB (they start 2030-06-10), so no other spec can put a row on it.
	await page.goto(`/today?d=${D.empty}`);
	await expect(page.getByText('Nothing planned.', { exact: true })).toBeVisible();
	await expect(page.locator('button.sq')).toHaveCount(0);
	let cycles = 0;
	const countCycle = (r: Request) => {
		if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/cycle')) cycles++;
	};
	page.on('request', countCycle);
	try {
		const card = (await page.locator('section.tl').boundingBox())!;
		await page.touchscreen.tap(card.x + 10, card.y + 10); // blank padding: nothing to shield
		await page.waitForTimeout(250);
		expect(cycles).toBe(0);
		await page.getByRole('button', { name: '+ Add something' }).tap(); // an immediate tap is not absorbed
		const add = page.getByRole('dialog', { name: 'Add' });
		await expect(add).toBeVisible();
		await add.getByRole('button', { name: 'Close', exact: true }).tap();
	} finally {
		page.off('request', countCycle);
	}
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('.toast')).toHaveCount(0);

	// failed cycle: error toast, optimistic over[id] cleared, every row at its server status
	const failOther = `F379 C7 other ${P} ${RUN}`;
	const failTitle = `F379 C7 fail ${P} ${RUN}`;
	const failOtherId = await mkItem(failOther, D.fail, '09:00');
	const failId = await mkItem(failTitle, D.fail, '10:00');
	await page.goto(`/today?d=${D.fail}`);
	const failPath = `/api/items/${failId}/cycle`;
	const isFail = (u: URL) => u.pathname === failPath;
	await page.route(isFail, (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'boom', message: 'Blind 379 cycle failed' } }),
		}),
	);
	try {
		await square(failTitle).tap();
		const alert = page.locator('.toast[role="alert"]');
		await expect(alert).toContainText('Blind 379 cycle failed');
		await expect.poll(() => itemStatus(failId)).toBe('todo');
		await expect(square(failTitle)).toHaveAttribute('aria-label', /Not started/);
		expect(await itemStatus(failOtherId)).toBe('todo');
		await expect(square(failOther)).toHaveAttribute('aria-label', /Not started/);
	} finally {
		await page.unroute(isFail);
	}

	// loading: the server-rendered list stays while the cycle is pending, no skeleton added
	const loadTitle = `F379 C7 loading ${P} ${RUN}`;
	const loadId = await mkItem(loadTitle, D.loading, '10:00');
	await page.goto(`/today?d=${D.loading}`);
	let release: () => void = () => {};
	const gate = new Promise<void>((r) => (release = r));
	const loadPath = `/api/items/${loadId}/cycle`;
	const isLoading = (u: URL) => u.pathname === loadPath;
	await page.route(isLoading, async (route) => {
		await gate;
		await route.continue();
	});
	try {
		await square(loadTitle).tap();
		await expect(page.getByRole('button', { name: loadTitle, exact: true })).toBeVisible();
		expect(await page.locator('[class*="skeleton"], [data-skeleton]').count()).toBe(0);
		release();
		await expect.poll(() => itemStatus(loadId)).toBe('doing');
	} finally {
		release();
		await page.unroute(isLoading);
	}
});

test('C8 other callers: Home tick commits once; the item sheet follows before refresh and stays usable', async () => {
	phoneOnly();
	// Home: a planner-block tick still commits once
	const homeLabel = `F379 C8 block ${P} ${RUN}`;
	const blockId = await mkBlock(homeLabel, D.home, 9);
	await page.goto(`/?d=${D.home}`);
	const blk = page.locator('.blk').filter({ hasText: homeLabel }).first();
	await blk.scrollIntoViewIfNeeded();
	const blkSq = blk.locator('button.sq').first();
	await expect(blkSq).toBeVisible();
	const homeCycles: string[] = [];
	const onReq = (r: Request) => {
		const p = new URL(r.url()).pathname;
		if (r.method() === 'POST' && p.endsWith('/cycle')) homeCycles.push(p);
	};
	page.on('request', onReq);
	try {
		await blkSq.tap();
		await expect.poll(() => blockStatus(blockId, D.home)).toBe('doing');
		await page.waitForTimeout(350);
	} finally {
		page.off('request', onReq);
	}
	expect(homeCycles).toEqual([`/api/blocks/${blockId}/cycle`]);

	// item sheet: ticking a repeating occurrence follows the detached row, then a second tap after ~300 ms works
	const repTitle = `F379 C8 repeat ${P} ${RUN}`;
	const repId = await mkItem(repTitle, D.sheet, '10:00', 'FREQ=DAILY;COUNT=4');
	await page.goto(`/today?d=${D.sheet}`);
	await row(repTitle).getByRole('button', { name: repTitle, exact: true }).tap();
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	await page.waitForTimeout(300); // the sheet grows out of the row
	const occId = `${repId}@${D.sheet}`;
	const ticked = page.waitForResponse(
		(r) =>
			r.request().method() === 'POST' &&
			new URL(r.url()).pathname === `/api/items/${encodeURIComponent(occId)}/cycle`,
	);
	await sheet.locator('button.sq').first().tap();
	const newId = ((await (await ticked).json()) as { item: { id: string } }).item.id;
	expect(newId).not.toBe(repId); // the occurrence was detached into its own row
	await expect.poll(() => new URL(page.url()).pathname).toBe(`/item/${newId}`); // follow() before the refresh
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole('heading', { name: repTitle })).toBeVisible();
	await expect(sheet.getByText('Could not load this item.')).toHaveCount(0);
	await expect.poll(() => itemStatus(newId)).toBe('doing');

	await page.waitForTimeout(320); // shield released
	await sheet.locator('button.sq').first().tap(); // a deliberate second tap works
	await expect.poll(() => itemStatus(newId)).toBe('done');
	await expect(sheet).toBeVisible();
});

test('C9 permission: a partner row shows no square and no ⋯, and cannot be cycled before or after the shield', async ({
	browser,
}) => {
	phoneOnly();
	const day = D.share;
	const myTitle = `F379 C9 target ${P} ${RUN}`;
	const myId = await mkItem(myTitle, day, '10:00');
	await mkItem(`F379 C9 other ${P} ${RUN}`, day, '09:00');

	// open sign-up so a partner account can be made (admin)
	await page.goto('/settings/users');
	await page.locator('form.mode').locator('input[name="open"][value="1"]').check();
	await page.locator('form.mode').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = test.info().project.use;
	const partnerCtx = await browser.newContext({
		viewport,
		isMobile,
		hasTouch,
		userAgent,
		deviceScaleFactor,
		serviceWorkers: 'block',
	});
	const p = await partnerCtx.newPage();
	try {
		await p.goto('/signup');
		await p.fill('#nu', `b379p${RUN}`);
		await p.fill('#dn', 'Blind 379 Partner');
		await p.fill('#np', 'good pass phrase 2');
		await p.fill('#cp', 'good pass phrase 2');
		await p.getByRole('button', { name: 'Create account' }).tap();
		await p.waitForURL((u) => new URL(u).pathname === '/');
		const skip = p.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();

		// swap codes: the partner shares their calendar with me
		await p.goto('/settings/sharing');
		await p.getByRole('button', { name: 'Make a code' }).click();
		const code = (await p.getByLabel('Your share code').textContent())!.trim();
		await page.goto('/settings/sharing');
		await page.getByLabel('Code from the other person').fill(code);
		await page.getByRole('button', { name: 'Add calendar' }).click();
		await expect(
			page.getByText("You can now see Blind 379 Partner's calendar on Home and Week."),
		).toBeVisible();

		const partnerTitle = `F379 C9 partner ${P} ${RUN}`;
		const partnerId = await p.evaluate(
			async ([d, title]) => {
				const r = await fetch('/api/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ title, date: d, time: '14:00', type: 'Event' }),
				});
				return ((await r.json()) as { item: { id: string } }).item.id;
			},
			[day, partnerTitle] as [string, string],
		);
		const partnerStatus = () =>
			p.evaluate(async (i) => {
				const r = await fetch(`/api/items/${i}`);
				return r.status === 200 ? ((await r.json()) as { item: { status: string } }).item.status : 'gone';
			}, partnerId);

		await page.goto(`/today?d=${day}`);
		const partnerRow = page.getByRole('group', { name: partnerTitle, exact: true });
		await expect(partnerRow).toBeVisible();
		await expect(partnerRow.locator('.who')).toHaveText('B');
		await expect(partnerRow.locator('button.sq')).toHaveCount(0); // no status square
		await expect(partnerRow.getByRole('button', { name: `Actions for ${partnerTitle}` })).toHaveCount(0); // no ⋯
		await expect(partnerRow.getByRole('button', { name: partnerTitle, exact: true })).toBeDisabled();

		const partnerCycles: string[] = [];
		const onReq = (r: Request) => {
			const path = new URL(r.url()).pathname;
			if (r.method() === 'POST' && path.endsWith('/cycle') && path.includes(encodeURIComponent(partnerId)))
				partnerCycles.push(path);
		};
		page.on('request', onReq);
		try {
			const before = await partnerStatus();
			// where a status square would sit on the partner row (the .box starts with its badge)
			const spot = async () => {
				await partnerRow.scrollIntoViewIfNeeded();
				const b = (await partnerRow.locator('.box').boundingBox())!;
				return { x: b.x + 20, y: b.y + b.height / 2 };
			};
			// before the shield: a tap where a square would sit does nothing
			let at = await spot();
			await page.touchscreen.tap(at.x, at.y);
			await page.waitForTimeout(200);
			// after the shield is raised: the same tap still does nothing
			const c = await centreOf(square(myTitle));
			await page.touchscreen.tap(c.x, c.y);
			at = await spot();
			await page.touchscreen.tap(at.x, at.y);
			await page.waitForTimeout(200);
			// after it releases: still nothing
			await page.waitForTimeout(200);
			at = await spot();
			await page.touchscreen.tap(at.x, at.y);
			await page.waitForTimeout(200);

			expect(partnerCycles).toEqual([]);
			expect(await partnerStatus()).toBe(before);
			await expect(partnerRow.locator('button.sq')).toHaveCount(0);
			await expect(partnerRow.getByRole('button', { name: `Actions for ${partnerTitle}` })).toHaveCount(0);
			expect(await itemStatus(myId)).toBe('doing'); // my own square did work
		} finally {
			page.off('request', onReq);
		}
	} finally {
		await partnerCtx.close();
	}
});

test('C10 desktop: a single click still cycles once and the toast Undo path works', async ({ browser }) => {
	phoneOnly(); // a desktop pointer check; runs once from this file
	const day = D.desk;
	const title = `F379 C10 target ${P} ${RUN}`;
	const id = await mkItem(title, day, '10:00');

	const ctx = await browser.newContext(); // defaults = 1440×900, fine pointer (no touch)
	const d = await ctx.newPage();
	try {
		await signIn(d);
		await d.goto(`/today?d=${day}`);
		const sq = d.getByRole('group', { name: title, exact: true }).locator('button.sq').first();
		const cycles: string[] = [];
		const onReq = (r: Request) => {
			const path = new URL(r.url()).pathname;
			if (r.method() === 'POST' && path.endsWith('/cycle')) cycles.push(path);
		};
		d.on('request', onReq);
		try {
			await sq.click();
			await expect(d.locator('.toast')).toContainText(`Started: "${title}"`);
			await expect.poll(() => itemStatus(id)).toBe('doing');
			expect(cycles).toEqual([`/api/items/${id}/cycle`]); // one click = one cycle

			await d.locator('.toast').getByRole('button', { name: 'Undo' }).click();
			await expect.poll(() => itemStatus(id)).toBe('todo');
			await expect(sq).toHaveAttribute('aria-label', /Not started/);
		} finally {
			d.off('request', onReq);
		}
		// the diff adds no desktop-specific UI or copy
		expect(
			await d.evaluate(() => {
				const out: string[] = [];
				for (const el of document.querySelectorAll<HTMLElement>('*')) {
					if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
					const mark = `${el.id} ${String(el.className)} ${el.getAttribute('aria-label') ?? ''} ${el.textContent?.slice(0, 40) ?? ''}`; // prettier-ignore
					if (/shield|tap again|please wait/i.test(mark)) out.push(mark.trim().slice(0, 60));
				}
				return out;
			}),
		).toEqual([]);
	} finally {
		await ctx.close();
	}
});
