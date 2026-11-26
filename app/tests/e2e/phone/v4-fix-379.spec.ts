// #379 (S2, phone web): three taps 20-60 ms apart on a Today status square changed an unrelated row after
// the list re-rendered. D-V4-40: cycleRow raises the shared 250 ms touch shield before its POST (no re-arm
// after the refresh) for every caller (Home, Today, ItemView); the Undo toast stays tappable.
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { expectTappable, expectTargets48, noDesktopHints, PW, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let P = '';

// days unused by other specs, far from today
const DAY_BURST = '2031-06-10';
const DAY_RELEASE = '2031-06-11';
const DAY_UNDO = '2031-06-12';
const DAY_PATH = '2031-06-13';
const DAY_EMPTY = '2024-01-15'; // before every repeating series starts, so no other spec can add a row
const DAY_FAIL = '2031-06-14';
const DAY_HOME = '2031-06-15';
const DAY_SHEET = '2031-06-16';
const DAY_PARTNER = '2031-06-17';
const DAY_DESKTOP = '2031-06-18';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	// service workers off: the failed-cycle test needs the POST on the page for page.route (as keepretry.spec.ts)
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

const make = (title: string, time: string, day: string) =>
	page.evaluate(
		async ([t, tm, d]) => {
			const r = await fetch('/api/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: t, date: d, time: tm }),
			});
			return ((await r.json()) as { item: { id: string } }).item.id;
		},
		[title, time, day] as const,
	);

const itemStatus = (id: string) =>
	page.evaluate(
		async (i) =>
			((await (await fetch(`/api/items/${i}`)).json()) as { item: { status: string } }).item.status,
		id,
	);

const centreOf = async (el: Locator) => {
	const b = (await el.boundingBox())!;
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const tap = (p: { x: number; y: number }) => page.touchscreen.tap(Math.round(p.x), Math.round(p.y));

/** three taps 30 ms apart on one point: the rest of the burst must be absorbed (the #379 repro is 20-60 ms) */
async function burst(sq: Locator) {
	const at = await centreOf(sq);
	for (let i = 0; i < 3; i++) {
		if (i) await page.waitForTimeout(30);
		await tap(at);
	}
}

/** every /cycle POST and PATCH the page sends while watching */
function watch() {
	const cycles: string[] = [];
	const patches: string[] = [];
	const on = (r: Request) => {
		const path = new URL(r.url()).pathname;
		if (r.method() === 'POST' && path.endsWith('/cycle')) cycles.push(path);
		if (r.method() === 'PATCH') patches.push(path);
	};
	page.on('request', on);
	return { cycles, patches, off: () => page.off('request', on) };
}

test('C1 one transition per burst · C2 no unrelated row changes · C3 one request', async () => {
	const target = `F379 target ${P}`;
	const other = `F379 other ${P}`;
	const id = await make(target, '09:00', DAY_BURST);
	const otherId = await make(other, '10:00', DAY_BURST);
	await page.goto(`/today?d=${DAY_BURST}`);
	const row = page.getByRole('group', { name: target, exact: true });
	const otherRow = page.getByRole('group', { name: other, exact: true });
	const sq = row.locator('button.sq');
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
	await expect(otherRow.locator('button.sq')).toHaveAttribute('aria-label', /Not started/);
	const req = watch();
	try {
		await burst(sq);
		// C1: one step only (todo -> doing), never done
		await expect.poll(() => itemStatus(id)).toBe('doing');
		await page.waitForTimeout(400); // a late refresh must not advance it again
		expect(await itemStatus(id)).toBe('doing');
		// C2: the neighbour is untouched by API and by UI, and no toast names it
		expect(await itemStatus(otherId)).toBe('todo');
		await expect(otherRow.locator('button.sq')).toHaveAttribute('aria-label', /Not started/);
		await expect(otherRow.locator('button.sq')).not.toBeFocused();
		const toast = page.locator('.toast');
		await expect(toast).toContainText(`Started: "${target}"`);
		await expect(toast).not.toContainText(other);
		// C3: one POST for the target, no /cycle for any other row, no queued PATCH
		expect(req.cycles).toEqual([`/api/items/${id}/cycle`]);
		expect(req.patches).toEqual([]);
	} finally {
		req.off();
	}
});

test('C4 shield, then release: a tap at ~200 ms is absorbed, the square advances again after ~300 ms', async () => {
	const title = `F379 release ${P}`;
	const id = await make(title, '09:00', DAY_RELEASE);
	await page.goto(`/today?d=${DAY_RELEASE}`);
	const row = page.getByRole('group', { name: title, exact: true });
	const sq = row.locator('button.sq');
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
	const at = await centreOf(sq);
	const req = watch();
	try {
		await tap(at); // todo -> doing, shield raised here
		await page.waitForTimeout(180);
		await tap(at); // ~200 ms after the first: inside the 250 ms window
		await page.waitForTimeout(120);
		expect(req.cycles).toHaveLength(1);
		await expect.poll(() => itemStatus(id)).toBe('doing');
		// no visible overlay or copy: the point still belongs to the row
		expect(
			await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.ent'), [
				Math.round(at.x),
				Math.round(at.y),
			] as const),
		).toBe(true);
		await page.waitForTimeout(300); // well past the window: the shield released by itself
		await tap(await centreOf(sq)); // doing -> done
		await expect.poll(() => itemStatus(id)).toBe('done');
		expect(req.cycles).toHaveLength(2);
		await expect(sq).toHaveAttribute('aria-label', /Completed/);
	} finally {
		req.off();
	}
});

test('C5 Undo after the shield restores the target; reachable; no Ctrl+Z wording on phone', async () => {
	const title = `F379 undo ${P}`;
	const id = await make(title, '09:00', DAY_UNDO);
	await page.goto(`/today?d=${DAY_UNDO}`);
	const sq = page.getByRole('group', { name: title, exact: true }).locator('button.sq');
	await tap(await centreOf(sq));
	const toast = page.locator('.toast');
	await expect(toast).toContainText(`Started: "${title}"`);
	await expect.poll(() => itemStatus(id)).toBe('doing');
	await page.waitForTimeout(320); // the shield has expired
	const undo = toast.getByRole('button', { name: 'Undo' });
	await expectTappable(undo); // the Undo toast is exempt and stays reachable
	await undo.tap();
	await expect.poll(() => itemStatus(id)).toBe('todo');
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
	await noDesktopHints(page);
});

test('C6 phone path: 48 dp square, the row ⋯ path and Back unchanged, no desktop hints', async () => {
	const title = `F379 path ${P}`;
	const id = await make(title, '09:00', DAY_PATH);
	await page.goto(`/today?d=${DAY_PATH}`);
	const row = page.getByRole('group', { name: title, exact: true });
	const sq = row.locator('button.sq');
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
	await expectTargets48(page); // StatusSquare's coarse ::after stays 48x48
	const at = await centreOf(sq);
	await tap({ x: at.x - 20, y: at.y }); // 20 px off the 20 px box: only the 48 dp area reaches it
	await expect.poll(() => itemStatus(id)).toBe('doing');
	await page.waitForTimeout(320);
	const more = page.getByRole('button', { name: `Actions for ${title}` });
	await tap(await centreOf(more));
	const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
	await expect(sheet).toBeVisible();
	await page.goBack(); // Back closes the existing layer, not the page
	await expect(sheet).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/today');
	await noDesktopHints(page);
});

test('C7 states: empty Today shows "Nothing planned.", no square, no shield raised', async () => {
	await page.goto(`/today?d=${DAY_EMPTY}`);
	await expect(page.getByText('Nothing planned.')).toBeVisible();
	await expect(page.locator('button.sq')).toHaveCount(0);
	// nothing raised a shield: the first tap on + Add something answers at once
	await tap(await centreOf(page.getByRole('button', { name: /Add something/ })));
	await expect(page.getByRole('dialog', { name: 'Add' })).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('dialog', { name: 'Add' })).toBeHidden();
});

test('C7 states: a failed cycle shows the error toast and leaves every row at its server status', async () => {
	const title = `F379 fail ${P}`;
	const other = `F379 fail other ${P}`;
	const id = await make(title, '09:00', DAY_FAIL);
	const otherId = await make(other, '10:00', DAY_FAIL);
	await page.goto(`/today?d=${DAY_FAIL}`);
	const row = page.getByRole('group', { name: title, exact: true });
	const otherRow = page.getByRole('group', { name: other, exact: true });
	const fail = `**/api/items/${id}/cycle`;
	await page.route(fail, (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'fail', message: 'Could not tick' } }),
		}),
	);
	try {
		await tap(await centreOf(row.locator('button.sq')));
		await expect(page.locator('.toast[role="alert"]')).toContainText('Could not tick');
		// the optimistic over[id] was cleared: the square is back to the server value
		await expect(row.locator('button.sq')).toHaveAttribute('aria-label', /Not started/);
		expect(await itemStatus(id)).toBe('todo');
		expect(await itemStatus(otherId)).toBe('todo');
		await expect(otherRow.locator('button.sq')).toHaveAttribute('aria-label', /Not started/);
	} finally {
		await page.unroute(fail);
	}
});

test('C8 other callers: a Home tick still commits once', async () => {
	const title = `F379 home ${P}`;
	const id = await make(title, '10:00', DAY_HOME);
	await page.goto(`/?desktop&m=${DAY_HOME.slice(0, 7)}&d=${DAY_HOME}`);
	const sq = page.locator('.lt-chip', { hasText: title }).locator('.lt-sq');
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
	await sq.evaluate((n) => n.scrollIntoView({ block: 'center' })); // landscape: the cell may be below the fold
	const req = watch();
	try {
		await burst(sq);
		await expect.poll(() => itemStatus(id)).toBe('doing');
		await page.waitForTimeout(300);
		expect(await itemStatus(id)).toBe('doing'); // one transition, not done
		expect(req.cycles).toEqual([`/api/items/${id}/cycle`]);
	} finally {
		req.off();
	}
});

test('C8 other callers: the item sheet tick commits once and follows before the refresh', async () => {
	const title = `F379 sheet ${P}`;
	await page.evaluate(
		async ([t, d]) => {
			await fetch('/api/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: t, date: d, time: '10:00', rrule: 'FREQ=DAILY;COUNT=5' }),
			});
		},
		[title, DAY_SHEET] as const,
	);
	// the Today row's occurrence opens the shared item sheet on that occurrence
	await page.goto(`/today?d=${DAY_SHEET}`);
	await tap(
		await centreOf(
			page.getByRole('group', { name: title, exact: true }).getByRole('button', { name: title, exact: true }),
		),
	);
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await expect(sheet).toBeVisible();
	const sq = sheet.locator('button.sq').first();
	await expect(sq).toHaveAttribute('aria-label', /Not started/);
	const req = watch();
	try {
		await tap(await centreOf(sq));
		await expect(sq).toHaveAttribute('aria-label', /In progress/);
		await expect(page).not.toHaveURL(/@/); // follow() ran before the refresh
		await expect(page.getByText('Not found')).toHaveCount(0);
		// the shield did not leave the sheet unclickable: a deliberate second tap after ~300 ms works
		await page.waitForTimeout(320);
		await tap(await centreOf(sq));
		await expect(sq).toHaveAttribute('aria-label', /Completed/);
		expect(req.cycles).toHaveLength(2);
		await expect(sheet).toBeVisible();
	} finally {
		req.off();
	}
	await page.goBack();
	await expect(sheet).toBeHidden();
});

test('C9 sharing: a partner row has no square or ⋯ before and after a shielded burst', async ({
	browser,
}) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = test.info().project.use;
	const partnerCtx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	const p = await partnerCtx.newPage();
	try {
		// no server route or access check changed: the diff in cycleRow only raises the DOM shield
		await page.goto('/settings/users');
		await page.locator('form.mode').locator('input[name="open"][value="1"]').check();
		await page.locator('form.mode').getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

		const username = `f379p${P === 'phone' ? 'a' : 'b'}`;
		await p.goto('/signup');
		await p.fill('#nu', username);
		await p.fill('#dn', 'F379 Partner');
		await p.fill('#np', `${PW} 2`);
		await p.fill('#cp', `${PW} 2`);
		await p.getByRole('button', { name: 'Create account' }).click();
		await p.waitForURL((u) => new URL(u).pathname === '/');
		const skip = p.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();

		// the partner shares their calendar with me
		await p.goto('/settings/sharing');
		await p.getByRole('button', { name: 'Make a code' }).click();
		const code = (await p.getByLabel('Your share code').textContent())!.trim();
		await page.goto('/settings/sharing');
		await page.getByLabel('Code from the other person').fill(code);
		await page.getByRole('button', { name: 'Add calendar' }).click();
		await expect(page.getByText("You can now see F379 Partner's calendar on Home and Week.")).toBeVisible();

		// one partner item (Event is visible under the default share code) and one of mine on the same day
		const partnerTitle = `F379 partner row ${P}`;
		const partnerItemId = await p.evaluate(
			async ([day, t]) => {
				const r = await fetch('/api/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ title: t, date: day, time: '14:00', type: 'Event' }),
				});
				return ((await r.json()) as { item: { id: string } }).item.id;
			},
			[DAY_PARTNER, partnerTitle] as const,
		);
		const mine = `F379 partner mine ${P}`;
		const mineId = await make(mine, '09:00', DAY_PARTNER);

		await page.goto(`/today?d=${DAY_PARTNER}`);
		const their = page.getByRole('group', { name: partnerTitle, exact: true });
		await expect(their).toBeVisible();
		await expect(their.locator('.who')).toHaveText('F'); // their badge, read-only row
		await expect(their.locator('button.sq')).toHaveCount(0);
		await expect(their.getByRole('button', { name: `Actions for ${partnerTitle}` })).toHaveCount(0);
		await expect(their.getByRole('button', { name: partnerTitle, exact: true })).toBeDisabled();
		const status = () =>
			p.evaluate(
				async (i) =>
					((await (await fetch(`/api/items/${i}`)).json()) as { item: { status: string } }).item.status,
				partnerItemId,
			);
		const before = await status();
		const req = watch();
		try {
			await burst(page.getByRole('group', { name: mine, exact: true }).locator('button.sq'));
			await expect.poll(() => itemStatus(mineId)).toBe('doing');
			expect(req.cycles).toEqual([`/api/items/${mineId}/cycle`]); // never theirs
		} finally {
			req.off();
		}
		expect(await status()).toBe(before);
		await expect(their.locator('button.sq')).toHaveCount(0);
		await expect(their.getByRole('button', { name: `Actions for ${partnerTitle}` })).toHaveCount(0);
	} finally {
		await partnerCtx.close();
	}
});

test('C10 desktop: a click still cycles once and the toast Undo works, no new copy', async ({ browser }) => {
	const ctx = await browser.newContext({
		storageState: await page.context().storageState(),
		viewport: { width: 1440, height: 900 },
		timezoneId: 'Asia/Kuala_Lumpur',
	});
	const d = await ctx.newPage();
	try {
		const title = `F379 desktop ${P}`;
		await d.goto('/');
		const id = await d.evaluate(
			async ([t, day]) => {
				const r = await fetch('/api/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ title: t, date: day, time: '09:00' }),
				});
				return ((await r.json()) as { item: { id: string } }).item.id;
			},
			[title, DAY_DESKTOP] as const,
		);
		await d.goto(`/today?d=${DAY_DESKTOP}`);
		const sq = d.getByRole('group', { name: title, exact: true }).locator('button.sq');
		await expect(sq).toHaveAttribute('aria-label', /Not started/);
		const cycles: string[] = [];
		const on = (r: Request) => {
			if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/cycle'))
				cycles.push(new URL(r.url()).pathname);
		};
		d.on('request', on);
		try {
			await sq.click();
			await expect(sq).toHaveAttribute('aria-label', /In progress/);
			expect(cycles).toEqual([`/api/items/${id}/cycle`]);
			const toast = d.locator('.toast');
			await expect(toast).toContainText(`Started: "${title}"`);
			await toast.getByRole('button', { name: 'Undo' }).click();
			await expect
				.poll(() =>
					d.evaluate(
						async (i) =>
							((await (await fetch(`/api/items/${i}`)).json()) as { item: { status: string } }).item.status,
						id,
					),
				)
				.toBe('todo');
			await expect(sq).toHaveAttribute('aria-label', /Not started/);
			await expect(d.locator('body')).not.toContainText(/shield/i); // no new copy for desktop
		} finally {
			d.off('request', on);
		}
	} finally {
		await ctx.close();
	}
});
