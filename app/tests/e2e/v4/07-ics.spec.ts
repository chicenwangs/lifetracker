// Card 07 (O-1 item 4, D-V4-08, D-V4-25, D-V4-37) on desktop: Settings › Calendar feed creates one URL and
// shows it once; /cal/<token>.ics is public and serves the owner's items; Rotate kills the old URL; Turn off
// ends the feed; a failed action shows the server message inline with Retry.
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];
const FEED = 'code[aria-label="Your calendar feed link"]';
const EMPTY = 'No feed yet. Create a link to see your plan in another calendar.';
const ON = 'Feed is on. Anyone with the link can read your items.';

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
	return r.j.item.id as string;
};
const drop = (page: Page, id: string) => api(page, 'DELETE', `/api/items/${id}`);
/** owner-local date n days from now (Asia/Kuala_Lumpur project timezone) */
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
const ymd = (d: string) => d.replace(/-/g, '');

/** the shared e2e DB can keep a feed from an earlier spec: start each check from "no feed" */
async function ensureOff(page: Page) {
	await page.goto('/settings/calendar-feed');
	const off = page.getByRole('button', { name: 'Turn off' });
	if (await off.isVisible().catch(() => false)) await off.click();
	await expect(page.getByRole('button', { name: 'Create feed link' })).toBeVisible();
}

test('C1 Calendar feed is a Planner settings section: empty copy + Create feed link, no URL', async ({
	page,
}) => {
	await signIn(page);
	await ensureOff(page);

	// desktop side nav ("Settings"), reached from another settings page
	await page.goto('/settings/account');
	const nav = page.getByRole('navigation', { name: 'Settings' });
	await expect(nav.getByRole('link', { name: 'Calendar feed' })).toHaveAttribute(
		'href',
		'/settings/calendar-feed',
	);
	await nav.getByRole('link', { name: 'Calendar feed' }).click();
	await expect(page).toHaveURL(/\/settings\/calendar-feed$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Calendar feed' })).toBeVisible();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create feed link' })).toBeVisible();
	await expect(page.locator(FEED)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Rotate' })).toHaveCount(0);
});

test('C2/C13 Create returns the URL once in form.url; a reload only shows that a feed exists; no undo toast', async ({
	page,
}) => {
	await signIn(page);
	await ensureOff(page);

	await page.getByRole('button', { name: 'Create feed link' }).click();
	const code = page.locator(FEED);
	await expect(code).toBeVisible();
	const url = (await code.innerText()).trim();
	expect(url).toMatch(/^http:\/\/localhost:\d+\/cal\/[A-Za-z0-9_-]{43}\.ics$/);
	await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Rotate' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Turn off' })).toBeVisible();
	// C13: users are outside the undo journal, so no undo toast
	await expect(page.locator('.toast')).toHaveCount(0);

	await page.reload();
	await expect(page.getByText(ON, { exact: true })).toBeVisible();
	await expect(page.locator(FEED)).toHaveCount(0); // shown once
	await expect(page.getByRole('button', { name: 'Rotate' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Turn off' })).toBeVisible();

	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible(); // Turn off survived the reload
});

test('C3 Copy writes the URL to the clipboard and flips to Copied', async ({ page }) => {
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await signIn(page);
	await ensureOff(page);

	await page.getByRole('button', { name: 'Create feed link' }).click();
	const url = (await page.locator(FEED).innerText()).trim();
	await page.getByRole('button', { name: 'Copy' }).click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
});

test('C5/C4 the feed is public with the right headers; Rotate kills the old URL and Turn off ends the feed', async ({
	page,
	request,
}) => {
	await signIn(page);
	await ensureOff(page);
	await page.getByRole('button', { name: 'Create feed link' }).click();
	const oldUrl = (await page.locator(FEED).innerText()).trim();

	// C5: no session cookie (a separate request context), no login, a calendar body
	const first = await request.get(oldUrl);
	expect(first.status()).toBe(200);
	expect(first.headers()['content-type']).toBe('text/calendar; charset=utf-8');
	expect(first.headers()['cache-control']).toBe('private, max-age=300');
	expect(first.headers()['cross-origin-resource-policy'] ?? '').not.toBe('same-origin');
	expect(await first.text()).toContain('BEGIN:VCALENDAR');

	// C4: rotate shows a new URL once; the old one is dead and the new one serves
	await page.reload();
	await page.getByRole('button', { name: 'Rotate' }).click();
	const newUrl = (await page.locator(FEED).innerText()).trim();
	expect(newUrl).not.toBe(oldUrl);
	expect((await request.get(oldUrl)).status()).toBe(404);
	expect((await request.get(newUrl)).status()).toBe(200);
	await page.reload(); // the rotate survived; the URL is not shown again
	await expect(page.getByText(ON, { exact: true })).toBeVisible();
	await expect(page.locator(FEED)).toHaveCount(0);

	// turn off: both URLs are dead and the empty state comes back after a reload
	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
	for (const u of [oldUrl, newUrl]) {
		const r = await request.get(u);
		expect(r.status()).toBe(404);
		expect(await r.text()).toBe('{}'); // bare JSON, no message, no token echo
	}
});

test('C5/C7/C8/C9 the feed carries my all-day, timed, private and repeating items only', async ({
	page,
	request,
}) => {
	await signIn(page);
	await ensureOff(page);
	const stamp = Date.now().toString(36);
	const today = await day(page, 0);
	const allDay = await mkItem(page, { title: `C7 trip ${stamp}`, date: today, endDate: await day(page, 2) });
	const timed = await mkItem(page, { title: `C9 standup ${stamp}`, date: today, time: '09:30' });
	const secret = await mkItem(page, { title: `C9 secret ${stamp}`, date: today, private: true });
	const repeat = await mkItem(page, { title: `C8 gym ${stamp}`, date: today, rrule: 'FREQ=DAILY;COUNT=5' });
	// C9: the earliest linked block sets the timed length (90 min); a block is never an event itself
	const b = await api(page, 'POST', '/api/blocks', {
		startAt: `${today}T01:00:00Z`,
		endAt: `${today}T02:30:00Z`,
		itemId: timed,
	});
	expect(b.s).toBe(201);
	const noted = await mkItem(page, { title: `C9 plain ${stamp}`, date: today, notes: 'Bring; milk, eggs' });

	try {
		await page.getByRole('button', { name: 'Create feed link' }).click();
		const url = (await page.locator(FEED).innerText()).trim();
		const body = await (await request.get(url)).text();

		expect(body).toContain('BEGIN:VCALENDAR');
		expect(body).toContain('VERSION:2.0');
		expect(body).toContain('END:VCALENDAR');
		expect(body).not.toContain('TZID');
		expect(body).not.toContain('VTIMEZONE');
		// all-day: exclusive DTEND on the 3-day span
		expect(body).toContain(`SUMMARY:C7 trip ${stamp}`);
		expect(body).toContain(`DTSTART;VALUE=DATE:${ymd(today)}`);
		expect(body).toContain(`DTEND;VALUE=DATE:${ymd(await day(page, 3))}`);
		// timed: a UTC instant, 90 minutes from the earliest block
		expect(body).toContain(`DTSTART:${ymd(today)}T013000Z`); // 09:30 KL
		expect(body).toContain(`DTEND:${ymd(today)}T030000Z`);
		// private: Busy, no title leak
		expect(body).not.toContain(`C9 secret ${stamp}`);
		expect(body).toContain('SUMMARY:Busy');
		// repeating: one VEVENT for the series, UID = the series id
		expect(body.split(`UID:${repeat}@lifetracker`).length - 1).toBe(1);
		expect(body).toContain('RRULE:FREQ=DAILY;COUNT=5');
		expect(body).not.toContain(`${repeat}@${today}@lifetracker`);
		// notes on a public item; the block itself is not an event
		expect(body).toContain(`SUMMARY:C9 plain ${stamp}`);
		expect(body).toContain('DESCRIPTION:Bring\\; milk\\, eggs');
	} finally {
		for (const id of [allDay, timed, secret, repeat, noted]) await drop(page, id);
		await page.goto('/settings/calendar-feed');
		const off = page.getByRole('button', { name: 'Turn off' });
		if (await off.isVisible().catch(() => false)) await off.click();
	}
});

test('C14 a failed Create shows the server message inline with Retry, never a toast; Retry works', async ({
	page,
}) => {
	await signIn(page);
	await ensureOff(page);
	const match = (u: URL) => u.pathname === '/settings/calendar-feed' && u.search === '?/create';
	await page.route(match, (route) =>
		route.request().method() === 'POST'
			? route.fulfill({
					status: 400,
					contentType: 'application/json',
					body: JSON.stringify({
						type: 'failure',
						status: 400,
						data: '[{"msg":1},"Feed service down"]',
					}),
				})
			: route.continue(),
	);
	try {
		await page.getByRole('button', { name: 'Create feed link' }).click();
		await expect(page.getByRole('alert')).toContainText('Feed service down');
		await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect(page.locator('.toast')).toHaveCount(0);
	} finally {
		await page.unroute(match);
	}
	await page.getByRole('button', { name: 'Retry' }).click();
	await expect(page.locator(FEED)).toBeVisible();

	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
});
