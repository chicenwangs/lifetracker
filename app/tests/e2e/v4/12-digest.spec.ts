// Card 12 (O-1 item 5, D-V4-13 / D-V4-19 / D-V4-30) on desktop: Settings › Notifications gets a Daily agenda row
// (segmented Off | On + time field), the preview chip is rendered once on the server from today's own items and
// blocks, the first On sends 07:30 from the client, Off stores NULL, and a failed save returns the control.
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];
const HELPER = "One notification a day with today's items and blocks. Nothing on → no notification.";

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

/** JSON fetch as the page's user (same helper shape as flow.spec.ts) */
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
const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return (r.j as { item: { id: string } }).item.id;
};
const mkBlock = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/blocks', body);
	expect(r.s).toBe(201);
	return (r.j as { block: { id: string } }).block.id;
};
/** owner-local date n days from now (Asia/Kuala_Lumpur project timezone) */
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);

/** C3/D-V4-13: the same counts from /api/calendar — own, top-level, not done, blocks on their start day */
const expectedText = (page: Page, date: string) =>
	page.evaluate(async (d) => {
		const t = new Date(`${d}T00:00:00Z`);
		t.setUTCDate(t.getUTCDate() + 1);
		const r = await fetch(`/api/calendar?from=${d}&to=${t.toISOString().slice(0, 10)}`);
		const j = (await r.json()) as {
			items: { id: string; date: string | null; time: string | null; status: string; parentId: string | null; theirs?: boolean }[]; // prettier-ignore
			blocks: { startAt: string; theirs?: boolean }[];
		};
		const seen = new Set<string>();
		const items = j.items.filter((i) => {
			if (i.parentId || i.status === 'done' || i.theirs || seen.has(i.id)) return false;
			seen.add(i.id);
			return true;
		});
		const pad = (n: number) => String(n).padStart(2, '0');
		const local = (iso: string) => {
			const x = new Date(iso);
			return {
				date: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`,
				min: x.getHours() * 60 + x.getMinutes(),
			};
		};
		const blocks = j.blocks.filter((b) => !b.theirs && local(b.startAt).date === d);
		let first: number | null = null;
		for (const i of items) {
			if (i.date !== d || !i.time) continue;
			const m = Number(i.time.slice(0, 2)) * 60 + Number(i.time.slice(3, 5));
			if (first === null || m < first) first = m;
		}
		for (const b of blocks) {
			const m = local(b.startAt).min;
			if (first === null || m < first) first = m;
		}
		const parts: string[] = [];
		if (items.length) parts.push(`${items.length} item${items.length === 1 ? '' : 's'}`);
		if (blocks.length) parts.push(`${blocks.length} block${blocks.length === 1 ? '' : 's'}`);
		if (first !== null) parts.push(`first ${pad(Math.floor(first / 60))}:${pad(first % 60)}`);
		return parts.join(' · ') || 'Nothing on today.';
	}, date);

test('C1/C2/C3/C4/C11/C12 On sends 07:30, the server-rendered preview matches today, Off clears it', async ({
	page,
}) => {
	await signIn(page);
	await api(page, 'PATCH', '/api/me/prefs', { digestTime: null, hiddenTypes: [] });
	const stamp = Date.now().toString(36);
	const today = await day(page, 0);
	const item = await mkItem(page, { title: `Digest item ${stamp}`, date: today, time: '09:00' });
	// 12:00Z = 20:00 KL: a block on today, counted for the day it starts
	const block = await mkBlock(page, {
		label: `Digest block ${stamp}`,
		startAt: `${today}T12:00:00Z`,
		endAt: `${today}T13:00:00Z`,
	});
	const group = page.getByRole('group', { name: 'Daily agenda' });
	const time = page.getByLabel('Daily agenda time');
	const prefs = (u: URL) => u.pathname === '/api/me/prefs';

	try {
		const expected = await expectedText(page, today);
		expect(expected).toContain('item'); // the timed item we just made
		expect(expected).toContain('block'); // and the block on today
		expect(expected).toMatch(/first \d\d:\d\d$/); // "first" = the earliest timed item / block start

		// C1: the row, its helper, Off first, no time field while Off, and the real preview text
		await page.goto('/settings/notifications');
		await expect(group).toBeVisible();
		await expect(page.getByText(HELPER)).toBeVisible();
		await expect(group.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
		await expect(time).toHaveCount(0);
		await expect(page.locator('.preview')).toHaveText(expected);
		// D-V4-30: rendered once by the server (the raw HTML already carries it, no client round trip)
		const html = await (await page.request.get('/settings/notifications')).text();
		expect(html).toContain(expected);

		// C2: the first switch to On sends 07:30 from the client (no server-side default write)
		const bodies: unknown[] = [];
		await page.route(prefs, (route) => {
			if (route.request().method() === 'PATCH') bodies.push(route.request().postDataJSON());
			return route.continue();
		});
		await group.getByRole('button', { name: 'On' }).click();
		await expect(group.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
		expect(bodies[0]).toEqual({ digestTime: '07:30' });
		await expect(time).toHaveValue('07:30');
		// C11: a users column is not in the undo journal: Saved shows no Undo
		await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
		await page.unroute(prefs);
		await page.reload();
		await expect(page.getByRole('group', { name: 'Daily agenda' }).getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true'); // prettier-ignore
		await expect(time).toHaveValue('07:30');

		// the time field saves at once and survives a reload
		await time.fill('08:15');
		await expect(time).toHaveValue('08:15');
		await page.reload();
		await expect(time).toHaveValue('08:15');

		// C12: a failed save shows the page error and the field returns to the stored value
		await page.route(prefs, (route) =>
			route.request().method() === 'PATCH'
				? route.fulfill({
						status: 400,
						contentType: 'application/json',
						body: JSON.stringify({ error: { code: 'bad_request', message: 'Nope' } }),
					})
				: route.continue(),
		);
		await time.fill('06:00');
		await expect(page.getByRole('alert')).toContainText('Nope');
		await expect(time).toHaveValue('08:15');
		await page.unroute(prefs);

		// C2/C3: Off stores NULL, hides the time field, and leaves the preview (it describes the day)
		await page.getByRole('group', { name: 'Daily agenda' }).getByRole('button', { name: 'Off' }).click();
		await expect(
			page.getByRole('group', { name: 'Daily agenda' }).getByRole('button', { name: 'Off' }),
		).toHaveAttribute('aria-pressed', 'true');
		await expect(time).toHaveCount(0);
		await expect(page.locator('.preview')).toHaveText(expected);
		await page.reload();
		await expect(page.getByRole('group', { name: 'Daily agenda' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true'); // prettier-ignore
		await expect(time).toHaveCount(0);
	} finally {
		await api(page, 'PATCH', '/api/me/prefs', { digestTime: null });
		await page.evaluate(
			(ids) => {
				void fetch(`/api/items/${ids.i}`, { method: 'DELETE' });
				void fetch(`/api/blocks/${ids.b}`, { method: 'DELETE' });
			},
			{ i: item, b: block },
		);
	}
});
