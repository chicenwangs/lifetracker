// Blind tests for card 16 (page emoji icon) on desktop, from its Done-when lines only:
// C1 (56 px icon / faint Add icon beside the title, 24 px+, icon still shown view-only), C2 (320 px popover,
// 8 × 5 of 36 px cells, keys, focus), C3 (pick = PATCH { icon }, reload, Remove = null, no search), C4 (page,
// sidebar tree, graph data), C8 (undo toast restores the icon, revision stays usable), C9 (failed PATCH keeps
// the old icon, alerts and re-reads). The sigma canvas label is not in the DOM; C4 checks its data instead.
// No builder test was opened.
import { expect, test, type Page, type Request } from '@playwright/test';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier in the run
const PREFIX = 'Blind16 ';
const ICONS =
	'📄 📝 📚 🎓 💼 🏠 🧠 💡 ✅ 📅 🗂️ 📌 🔖 🧪 🛠️ 💻 🖥️ 🌐 🔒 💰 🛒 🍳 🏋️ 🏃 🧘 🎮 🎬 📺 🎵 🎨 ✈️ 🚗 🌱 🐾 ❤️ ⭐ 🔥 ⚠️ ❓ 🎯'.split(
		' ',
	);

let page: Page;
let partner: Page;
let partnerUser = '';
const made: string[] = [];

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
interface PageDTO {
	id: string;
	title: string;
	icon: string | null;
	revision: number;
	access: string;
}
async function makePage(title: string, icon?: string): Promise<PageDTO> {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const created = (r.json as { page: PageDTO }).page;
	made.push(created.id);
	if (icon) {
		const set = await api(page, 'PATCH', `/api/pages/${created.id}`, { icon });
		expect(set.status, JSON.stringify(set.json)).toBe(200);
		return { ...created, icon };
	}
	return created;
}
const share = (id: string, permission: 'view' | 'edit') =>
	api(page, 'POST', `/api/shares/page/${id}`, { username: partnerUser, permission });
const getPage = async (id: string): Promise<PageDTO> =>
	((await api(page, 'GET', `/api/pages/${id}`)).json as { page: PageDTO }).page;
const picker = () => page.getByRole('dialog', { name: 'Icon' });
const iconButton = () => page.getByRole('button', { name: /^Page icon/ });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);

	// a partner account to open the view-only and edit-share cases. Invite only: the open-sign-up route is
	// capped per IP (OPEN_PER_IP = 5) and the full desktop run has used it before this file.
	partnerUser = `b16${Date.now().toString(36).slice(-8)}`;
	partner = await (await browser.newContext()).newPage();
	const inviteOnly = async () => {
		await page.goto('/settings/users');
		await page.locator('input[name="open"][value="0"]').check();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();
	};
	try {
		await inviteOnly();
		await page.getByRole('button', { name: 'Make invite code' }).click();
		await expect(page.locator('[role="status"] code').first()).toBeVisible();
		const code = (await page.locator('[role="status"] code').first().innerText()).trim();
		expect(code).toMatch(/^INV-/);

		await partner.goto('/signup');
		await partner.fill('#code', code);
		await partner.fill('#nu', partnerUser);
		await partner.fill('#dn', 'Blind partner');
		await partner.fill('#np', PW);
		await partner.fill('#cp', PW);
		await partner.getByRole('button', { name: 'Create account' }).click();
		await partner.waitForURL((u) => u.pathname === '/');
		const skip = partner.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();
	} finally {
		await inviteOnly(); // leave the shared e2e DB invite-only, whatever happened above
	}
});

test.afterAll(async () => {
	for (const id of made.splice(0)) await api(page, 'DELETE', `/api/pages/${id}`).catch(() => {});
	await page.context().close();
	await partner.context().close();
});

test.afterEach(async () => {
	for (const id of made.splice(0)) await api(page, 'DELETE', `/api/pages/${id}`);
});

// ---- C1 ----------------------------------------------------------------------------------------------------
test('C1 desktop: faint "Add icon" beside the title, a 56 px icon button, and view-only hides the entry but keeps the icon', async () => {
	const empty = await makePage(PREFIX + 'C1 empty');
	await page.goto(`/pages/${empty.id}`);
	await expect(page.getByLabel('Page title')).toHaveValue(PREFIX + 'C1 empty');

	const add = page.getByRole('button', { name: 'Add icon' });
	await expect(add).toBeVisible();
	const box = (await add.boundingBox())!;
	expect(box.width).toBeGreaterThanOrEqual(24);
	expect(box.height).toBeGreaterThanOrEqual(24);
	// beside the title: left of it, on the same line
	const title = (await page.getByLabel('Page title').boundingBox())!;
	expect(box.x + box.width).toBeLessThanOrEqual(title.x + 1);
	expect(Math.abs(box.y + box.height / 2 - (title.y + title.height / 2))).toBeLessThan(12);
	// faint = the --faint token, not the ink of the title
	const faint = await page.evaluate(() => {
		const probe = document.createElement('span');
		probe.style.color = 'var(--faint)';
		document.body.append(probe);
		const c = getComputedStyle(probe).color;
		probe.remove();
		return c;
	});
	expect(await add.evaluate((n) => getComputedStyle(n).color)).toBe(faint);
	expect(await add.evaluate((n) => getComputedStyle(n).fontSize)).toBe('13px');

	// with an icon: 56 px button, accessible name keeps "Page icon" and the emoji
	await api(page, 'PATCH', `/api/pages/${empty.id}`, { icon: '🎓' });
	await page.reload();
	const iconBtn = iconButton();
	await expect(iconBtn).toBeVisible();
	await expect(iconBtn).toHaveAttribute('aria-label', 'Page icon 🎓');
	await expect(iconBtn).toContainText('🎓');
	const ib = (await iconBtn.boundingBox())!;
	expect(Math.round(ib.width)).toBe(56);
	expect(Math.round(ib.height)).toBe(56);
	expect(await iconBtn.evaluate((n) => getComputedStyle(n).fontSize)).toBe('56px');

	// edit share = my page, still editable: the same button is there
	const editable = await makePage(PREFIX + 'C1 edit');
	expect((await share(editable.id, 'edit')).status).toBe(200);
	await partner.goto(`/pages/${editable.id}`);
	await expect(partner.getByRole('button', { name: 'Add icon' })).toBeVisible();

	// view-only with an icon: no entry and no picker, but the icon still displays; no error either
	const viewed = await makePage(PREFIX + 'C1 view', '🎓');
	expect((await share(viewed.id, 'view')).status).toBe(200);
	await partner.goto(`/pages/${viewed.id}`);
	await expect(partner.getByText('Shared with you · view only')).toBeVisible();
	await expect(partner.locator('.iconwrap button')).toHaveCount(0);
	const shown = partner.locator('.iconwrap .iconbtn.shown');
	await expect(shown).toBeVisible();
	await expect(shown).toHaveText('🎓');
	await expect(shown).toHaveAttribute('aria-label', 'Page icon');
	await expect(partner.getByRole('dialog', { name: 'Icon' })).toHaveCount(0);
	await expect(partner.locator('.toast.error')).toHaveCount(0);

	// view-only without an icon: no "Add icon" fallback either
	const blank = await makePage(PREFIX + 'C1 view empty');
	expect((await share(blank.id, 'view')).status).toBe(200);
	await partner.goto(`/pages/${blank.id}`);
	await expect(partner.getByText('Shared with you · view only')).toBeVisible();
	await expect(partner.locator('.iconwrap button')).toHaveCount(0);
	await expect(partner.locator('.iconwrap').getByText('Add icon')).toHaveCount(0);
});

// ---- C2 ----------------------------------------------------------------------------------------------------
test('C2 the popover is 320 px with the 40 curated emoji in 8 × 5 cells of 36 px, "Icon" and Remove, arrows/Enter/Esc and focus return', async () => {
	const p = await makePage(PREFIX + 'C2');
	await page.goto(`/pages/${p.id}`);
	await page.getByRole('button', { name: 'Add icon' }).click();
	const dlg = picker();
	await expect(dlg).toBeVisible();

	const pop = (await dlg.boundingBox())!;
	expect(Math.round(pop.width)).toBe(320);
	await expect(dlg).toBeFocused(); // the popover takes the keys on open

	// 40 cells, the exact curated set of DESIGN §2.2 line 72
	const cells = dlg.locator('.cell');
	await expect(cells).toHaveCount(40);
	expect(await cells.evaluateAll((ns) => ns.map((n) => n.textContent?.trim()))).toEqual(ICONS);
	// 8 × 5 grid of 36 px cells
	const grid = dlg.locator('.grid');
	const css = await grid.evaluate((n) => {
		const s = getComputedStyle(n);
		return { cols: s.gridTemplateColumns, rows: s.gridAutoRows };
	});
	expect(css.cols.split(' ')).toHaveLength(8);
	expect(new Set(css.cols.split(' '))).toEqual(new Set(['36px']));
	expect(css.rows).toBe('36px');
	const boxes = await cells.evaluateAll((ns) =>
		ns.map((n) => {
			const r = n.getBoundingClientRect();
			return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
		}),
	);
	expect(new Set(boxes.map((b) => b.x)).size).toBe(8);
	expect(new Set(boxes.map((b) => b.y)).size).toBe(5);
	expect(boxes.every((b) => b.w === 36 && b.h === 36)).toBe(true);

	// title "Icon" and Remove top-right
	await expect(dlg.locator('.top b')).toHaveText('Icon');
	const head = (await dlg.locator('.top b').boundingBox())!;
	const remove = dlg.getByRole('button', { name: 'Remove' });
	const rb = (await remove.boundingBox())!;
	expect(rb.x).toBeGreaterThan(head.x + head.width);
	expect(rb.x + rb.width).toBeLessThanOrEqual(pop.x + pop.width);
	expect(Math.abs(rb.y + rb.height / 2 - (head.y + head.height / 2))).toBeLessThan(12);

	// arrows move the highlight (8-column steps), Enter picks
	await expect(dlg.locator('.cell.on')).toHaveText('📄');
	await page.keyboard.press('ArrowRight');
	await expect(dlg.locator('.cell.on')).toHaveText('📝');
	await page.keyboard.press('ArrowDown');
	await expect(dlg.locator('.cell.on')).toHaveText('📅');
	await page.keyboard.press('ArrowUp');
	await expect(dlg.locator('.cell.on')).toHaveText('📝');
	const picked = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/api/pages/${p.id}`));
	await page.keyboard.press('Enter');
	expect((await picked).postDataJSON()).toEqual({ icon: '📝' });
	await expect(dlg).toHaveCount(0);

	// Esc closes and focus returns to the icon button
	const btn = iconButton();
	await expect(btn).toHaveAttribute('aria-label', 'Page icon 📝');
	await btn.click();
	await expect(picker()).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(picker()).toHaveCount(0);
	await expect(iconButton()).toBeFocused();
});

// ---- C3 ----------------------------------------------------------------------------------------------------
test('C3 picking sends PATCH { icon } that survives a reload; Remove sends icon: null and returns "Add icon"; no search, no full set', async () => {
	const p = await makePage(PREFIX + 'C3');
	await page.goto(`/pages/${p.id}`);
	await page.getByRole('button', { name: 'Add icon' }).click();
	const dlg = picker();
	await expect(dlg).toBeVisible();
	await expect(dlg.locator('input, textarea, [role=searchbox], [type=search]')).toHaveCount(0);
	await expect(dlg.getByText('🍕')).toHaveCount(0); // curated 40 only, not the full emoji set

	const picked = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/api/pages/${p.id}`));
	await dlg.getByRole('button', { name: '🎓', exact: true }).click();
	expect((await picked).postDataJSON()).toEqual({ icon: '🎓' });
	await expect(picker()).toHaveCount(0);
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 🎓');
	expect((await getPage(p.id)).icon).toBe('🎓');

	await page.reload();
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 🎓');

	const removed = page.waitForRequest(
		(r) => r.method() === 'PATCH' && r.url().endsWith(`/api/pages/${p.id}`),
	);
	await iconButton().click();
	await expect(picker()).toBeVisible();
	await picker().getByRole('button', { name: 'Remove' }).click();
	expect((await removed).postDataJSON()).toEqual({ icon: null });
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
	expect((await getPage(p.id)).icon).toBeNull();

	await page.reload();
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
});

// ---- C4 ----------------------------------------------------------------------------------------------------
test('C4 the icon shows on the page and in the sidebar tree, and the graph data carries it', async () => {
	const p = await makePage(PREFIX + 'C4', '📗');
	await page.goto(`/pages/${p.id}`);

	// the page itself
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 📗');
	// the desktop sidebar tree
	const treeLink = page.locator('nav[aria-label="Pages"] a', { hasText: PREFIX + 'C4' });
	await expect(treeLink).toContainText('📗 ' + PREFIX + 'C4');

	// the graph node data (the rendered sigma label is canvas-only; its source is this icon + title)
	const g = (await api(page, 'GET', '/api/graph')).json as {
		nodes: { id: string; title: string; icon: string | null; archived: boolean; kind: string }[];
	};
	const node = g.nodes.find((n) => n.id === p.id)!;
	expect(node).toMatchObject({ title: PREFIX + 'C4', icon: '📗', archived: false, kind: 'page' });
});

// ---- C8 ----------------------------------------------------------------------------------------------------
test('C8 the Undo toast restores the previous icon (or none), and the revision still matches the editor for the next text save', async () => {
	const p = await makePage(PREFIX + 'C8');
	await page.goto(`/pages/${p.id}`);
	const editor = page.getByLabel('Page content');
	await editor.click();
	await page.keyboard.type('text before the icon');
	await expect(page.locator('.state')).toHaveText('Saved', { timeout: 15_000 });

	// set → "Icon set · Undo" → back to "Add icon"
	await page.getByRole('button', { name: 'Add icon' }).click();
	await picker().getByRole('button', { name: '✅', exact: true }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Icon set');
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon ✅');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
	await expect.poll(async () => (await getPage(p.id)).icon).toBeNull();

	// the undo kept the icon's revision: typing again saves, no "Changed elsewhere"
	await editor.click();
	await page.keyboard.type(' and after the undo');
	await expect(page.locator('.state')).toHaveText('Saved', { timeout: 15_000 });
	await expect(page.getByText(/Changed elsewhere/)).toHaveCount(0);
	await page.reload();
	await expect(page.getByLabel('Page content')).toContainText('text before the icon and after the undo');
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();

	// removing an icon → "Icon removed · Undo" → the old icon is back
	await api(page, 'PATCH', `/api/pages/${p.id}`, { icon: '📚' });
	await page.reload();
	await iconButton().click();
	await picker().getByRole('button', { name: 'Remove' }).click();
	await expect(toast).toContainText('Icon removed');
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 📚');
	expect((await getPage(p.id)).icon).toBe('📚');
});

// ---- C9 ----------------------------------------------------------------------------------------------------
test('C9 states: opening the picker asks the server nothing, and a failed PATCH keeps the old icon, alerts and re-reads the page', async () => {
	const p = await makePage(PREFIX + 'C9', '📄');
	await page.goto(`/pages/${p.id}`);
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 📄');

	// loading = the picker opens from the local curated set, with no request
	let reads = 0;
	const count = (r: Request) => {
		if (r.resourceType() === 'fetch' || r.resourceType() === 'xhr') reads++;
	};
	page.on('request', count);
	try {
		await iconButton().click();
		await expect(picker()).toBeVisible();
		await page.waitForTimeout(500);
		expect(reads).toBe(0); // no request while the picker is open
		await picker().getByRole('button', { name: '🎯', exact: true }).click();
		await expect(picker()).toHaveCount(0);
	} finally {
		page.off('request', count);
	}
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 🎯');

	// a failed PATCH: old icon stays, the existing showError alerts, and the page re-reads from the server
	const fail = (url: URL) => url.pathname === `/api/pages/${p.id}`;
	await page.route(fail, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'boom', message: 'Blind16 failed icon.' } }),
				})
			: route.continue(),
	);
	let dataReads = 0;
	const reread = (r: Request) => {
		if (r.url().includes('/__data.json')) dataReads++;
	};
	page.on('request', reread);
	try {
		await iconButton().click();
		await picker().getByRole('button', { name: '🌱', exact: true }).click();
		const alert = page.locator('.toast.error');
		await expect(alert).toBeVisible();
		await expect(alert).toHaveAttribute('role', 'alert');
		await expect(alert).toContainText('Blind16 failed icon.');
		await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 🎯');
		await expect.poll(() => dataReads, { timeout: 5000 }).toBeGreaterThan(0);
		expect((await getPage(p.id)).icon).toBe('🎯');
	} finally {
		page.off('request', reread);
		await page.unroute(fail);
	}

	// nothing half-saved: a reload shows the last good icon
	await page.reload();
	await expect(iconButton()).toHaveAttribute('aria-label', 'Page icon 🎯');
});
