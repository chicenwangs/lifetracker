// Card 16 (D-V4-22, DESIGN §2.1–2.2): the page emoji icon on desktop — the button left of the title,
// the 320 px 8 × 5 popover with arrows / Enter / Esc and focus return, PATCH + reload, the sidebar icon,
// Remove, the undo toast (revision kept), view-only pages, and the failed-PATCH state.
import { expect, test, type Browser, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

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

/** JSON fetch as the page's user */
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

const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
async function mkPage(page: Page, title: string) {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	expect(r.s).toBe(201);
	return (r.j as { page: { id: string } }).page.id;
}
const iconBtn = (page: Page) => page.locator('.pagev .head .iconbtn');
const picker = (page: Page) => page.getByRole('dialog', { name: 'Icon' });

/** a second account, the way the e2e suite makes one: invite-only for a moment, one code, then /signup */
async function partner(browser: Browser, admin: Page) {
	await admin.goto('/settings/users');
	await admin.locator('input[name="open"][value="0"]').check();
	await admin.getByRole('button', { name: 'Save' }).click();
	await expect(admin.getByText('Saved.')).toBeVisible();
	await admin.getByRole('button', { name: 'Make invite code' }).click();
	await expect(admin.locator('[role="status"] code').first()).toBeVisible();
	const code = (await admin.locator('[role="status"] code').first().innerText()).trim();
	const username = `picoviewer${stamp()}`;
	const ctx = await browser.newContext();
	const p = await ctx.newPage();
	await p.goto('/signup');
	await p.fill('#code', code);
	await p.fill('#nu', username);
	await p.fill('#dn', 'Pico Viewer');
	await p.fill('#np', 'picture viewer phrase');
	await p.fill('#cp', 'picture viewer phrase');
	await p.getByRole('button', { name: 'Create account' }).click();
	await p.waitForURL((u) => u.pathname === '/');
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	return { ctx, p, username };
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('C1 the icon button sits left of the title, shows "Add icon" when empty and is at least 24 px', async ({
	page,
}) => {
	const id = await mkPage(page, `Icon c1 ${stamp()}`);
	await page.goto(`/pages/${id}`);
	const add = page.getByRole('button', { name: 'Add icon' });
	await expect(add).toBeVisible();
	const box = (await add.boundingBox())!;
	expect(box.width).toBeGreaterThanOrEqual(24);
	expect(box.height).toBeGreaterThanOrEqual(24);
	// left of the title input, on the same row
	const at = await page.evaluate(() => {
		const b = document.querySelector('.pagev .head .iconbtn')!.getBoundingClientRect();
		const t = document.querySelector('.pagev .head input.title')!.getBoundingClientRect();
		return b.right <= t.left + 1 && Math.abs(b.top + b.height / 2 - (t.top + t.height / 2)) < 60;
	});
	expect(at).toBe(true);
});

test('C2 the desktop popover is 320 px, 8 × 5 of 36 px cells; arrows + Enter pick, Esc closes and focus returns', async ({
	page,
}) => {
	const id = await mkPage(page, `Icon c2 ${stamp()}`);
	await page.goto(`/pages/${id}`);
	await page.getByRole('button', { name: 'Add icon' }).click();
	const dlg = picker(page);
	await expect(dlg).toBeVisible();
	await expect(dlg.getByText('Icon', { exact: true })).toBeVisible();
	await expect(dlg.getByRole('button', { name: 'Remove' })).toBeVisible();
	const geo = await dlg.evaluate((n) => {
		const r = n.getBoundingClientRect();
		const cells = [...n.querySelectorAll<HTMLElement>('.cell')];
		const first = cells[0]!.getBoundingClientRect();
		const cols = getComputedStyle(n.querySelector('.grid')!).gridTemplateColumns.split(' ').length;
		return {
			w: Math.round(r.width),
			n: cells.length,
			cols,
			cw: Math.round(first.width),
			ch: Math.round(first.height),
		};
	});
	expect(geo).toEqual({ w: 320, n: 40, cols: 8, cw: 36, ch: 36 });
	// keyboard: highlight starts on the first cell; one right = the second emoji, Enter picks it
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await expect(iconBtn(page)).toHaveText('📝');
	await expect(dlg).toBeHidden();
	// Esc closes without saving and focus goes back to the icon button
	await iconBtn(page).click();
	await expect(picker(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(picker(page)).toBeHidden();
	await expect(iconBtn(page)).toBeFocused();
	await expect(iconBtn(page)).toHaveText('📝');
});

test('C2 Remove keeps its own Enter: the highlighted emoji is not picked while Remove has focus', async ({
	page,
}) => {
	const id = await mkPage(page, `Icon c2b ${stamp()}`);
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { icon: '🎓' })).s).toBe(200);
	await page.goto(`/pages/${id}`);
	await iconBtn(page).click();
	const dlg = picker(page);
	await expect(dlg).toBeVisible();
	await page.keyboard.press('Tab');
	const remove = dlg.getByRole('button', { name: 'Remove' });
	await expect(remove).toBeFocused();
	const sent = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/api/pages/${id}`));
	await page.keyboard.press('Enter');
	// Remove ran (icon: null), not the highlighted emoji
	expect((await sent).postDataJSON()).toEqual({ icon: null });
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
});

test('C4 the graph list row shows the icon with the title, like the canvas label', async ({ page }) => {
	const title = `Icon c4 ${stamp()}`;
	const id = await mkPage(page, title);
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { icon: '📗' })).s).toBe(200);
	await page.goto('/pages/graph');
	await page.getByRole('button', { name: 'Show as list instead' }).click();
	const row = page.getByRole('list', { name: 'Pages and their links' }).getByRole('link', { name: title });
	await expect(row).toContainText(`📗 ${title}`);
});

test('C3 pick an emoji: PATCH, the icon survives a reload and the sidebar shows it; Remove goes back to "Add icon"', async ({
	page,
}) => {
	const title = `Icon c3 ${stamp()}`;
	const id = await mkPage(page, title);
	await page.goto(`/pages/${id}`);
	await page.getByRole('button', { name: 'Add icon' }).click();
	await picker(page).getByRole('button', { name: '📄', exact: true }).click();
	await expect(iconBtn(page)).toHaveText('📄');
	await expect(page.getByRole('status').filter({ hasText: 'Icon set' })).toBeVisible();
	// the sidebar tree and the API both carry it
	const link = page.getByRole('link', { name: title });
	await expect(link).toContainText('📄');
	const read = await api(page, 'GET', `/api/pages/${id}`);
	expect((read.j as { page: { icon: string | null } }).page.icon).toBe('📄');
	await page.reload();
	await expect(iconBtn(page)).toHaveText('📄');
	await expect(link).toContainText('📄');
	// Remove sends null
	await iconBtn(page).click();
	await picker(page).getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
	await expect(link).not.toContainText('📄');
});

test('C5 an icon change keeps unsaved editor text and the revision in line (no 409, no block rewrite)', async ({
	page,
}) => {
	const id = await mkPage(page, `Icon c5 ${stamp()}`);
	await page.goto(`/pages/${id}`);
	const editor = page.getByLabel('Page content');
	await editor.click();
	await page.keyboard.type('Before the icon');
	// pick while the text is still unsaved: the icon save flushes the editor first
	await page.getByRole('button', { name: 'Add icon' }).click();
	await picker(page).getByRole('button', { name: '🧪', exact: true }).click();
	await expect(iconBtn(page)).toHaveText('🧪');
	await editor.click();
	await page.keyboard.type(' and after');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await expect(page.getByText('Changed elsewhere')).toHaveCount(0);
	await page.reload();
	await expect(page.getByLabel('Page content')).toContainText('Before the icon and after');
	await expect(iconBtn(page)).toHaveText('🧪');
});

test('C5 a stale editor + another save: picking an icon is refused, the conflict stays and their text is kept', async ({
	page,
}) => {
	const id = await mkPage(page, `Icon c5b ${stamp()}`);
	await page.goto(`/pages/${id}`);
	const editor = page.getByLabel('Page content');
	await editor.click();
	await page.keyboard.type('mine saved first');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	const before = (await api(page, 'GET', `/api/pages/${id}`)).j as { page: { revision: number } };
	// another writer saves first: this open editor is now stale (its revision is one behind)
	const theirs = await page.evaluate(
		async ([pid, revision]) => {
			const r = await fetch(`/api/pages/${pid}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					doc: {
						type: 'doc',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'their text' }] }],
					},
					revision,
				}),
			});
			return r.status;
		},
		[id, before.page.revision] as const,
	);
	expect(theirs).toBe(200);
	// type in the stale editor, then pick an icon: the flush fails, so no icon PATCH and no new revision
	await editor.click();
	await page.keyboard.type(' mine after');
	await page.getByRole('button', { name: 'Add icon' }).click();
	await picker(page).getByRole('button', { name: '📄', exact: true }).click();
	await expect(page.getByText(/Changed elsewhere/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible(); // the pick was refused
	const afterPick = (await api(page, 'GET', `/api/pages/${id}`)).j as {
		page: { icon: string | null; revision: number };
	};
	expect(afterPick.page.icon).toBeNull();
	expect(afterPick.page.revision).toBe(before.page.revision + 1); // only their save bumped it
	// typing again tries to save and must still be a 409: their text is never overwritten
	const attempt = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/api/pages/${id}`));
	await editor.click();
	await page.keyboard.type(' and again');
	await attempt;
	await page.waitForTimeout(300);
	const now = (await api(page, 'GET', `/api/pages/${id}`)).j as {
		page: { revision: number; doc: { content: unknown[] } };
	};
	const serverText = JSON.stringify(now.page.doc);
	expect(serverText).toContain('their text');
	expect(serverText).not.toContain('mine');
	expect(now.page.revision).toBe(before.page.revision + 1);
});

test('C8 the icon toast Undo puts the previous icon back, and removing is undoable too', async ({ page }) => {
	const id = await mkPage(page, `Icon c8 ${stamp()}`);
	await page.goto(`/pages/${id}`);
	const pick = async (emoji: string) => {
		await iconBtn(page).click();
		await picker(page).getByRole('button', { name: emoji, exact: true }).click();
	};
	await pick('📄');
	await expect(iconBtn(page)).toHaveText('📄');
	await pick('📚');
	await expect(iconBtn(page)).toHaveText('📚');
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(iconBtn(page)).toHaveText('📄');
	// remove → undo brings it back
	await iconBtn(page).click();
	await picker(page).getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(iconBtn(page)).toHaveText('📄');
	// the editor still saves after an icon undo (D-V4-22: revision was not rolled back)
	await page.getByLabel('Page content').click();
	await page.keyboard.type('after the undo');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

test('C9 a failed PATCH shows the error and re-reads the page instead of pretending', async ({ page }) => {
	const id = await mkPage(page, `Icon c9 ${stamp()}`);
	await page.goto(`/pages/${id}`);
	// someone else (another tab) already set an icon: the open page has not seen it
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { icon: '📌' })).s).toBe(200);
	await page.route(/\/api\/pages\/pg_[0-9a-z]+$/, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'boom', message: 'Disk full' } }),
				})
			: route.fallback(),
	);
	await page.getByRole('button', { name: 'Add icon' }).click();
	await picker(page).getByRole('button', { name: '📄', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Disk full');
	// the re-read shows what the server really has, never the failed pick
	await expect(iconBtn(page)).toHaveText('📌');
	await page.unroute(/\/api\/pages\/pg_[0-9a-z]+$/);
});

test('C1 C7 a view-only page shows the icon but no entry or picker, and their icon PATCH is 403', async ({
	page,
	browser,
}) => {
	const id = await mkPage(page, `Icon c7 ${stamp()}`);
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { icon: '📄' })).s).toBe(200);
	const owner = await partner(browser, page);
	try {
		expect((await api(page, 'POST', `/api/shares/page/${id}`, { username: owner.username, permission: 'view' })).s).toBe(200); // prettier-ignore
		await owner.p.goto(`/pages/${id}`);
		await expect(owner.p.getByRole('img', { name: 'Page icon' })).toHaveText('📄'); // still displays
		await expect(owner.p.getByRole('button', { name: /Add icon|Page icon/ })).toHaveCount(0); // no entry
		await owner.p.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
		await expect(owner.p.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
		await expect(owner.p.getByRole('menuitem', { name: 'Add icon' })).toHaveCount(0);
		await expect(owner.p.getByRole('dialog', { name: 'Icon' })).toHaveCount(0); // no picker
		const denied = await api(owner.p, 'PATCH', `/api/pages/${id}`, { icon: '🔥' });
		expect(denied.s).toBe(403);
		const gone = await api(owner.p, 'PATCH', '/api/pages/pg_aaaaaaaaaaaaaaaa', { icon: '🔥' });
		expect(gone.s).toBe(404);
		// my icon is untouched by either attempt
		await page.goto(`/pages/${id}`);
		await expect(iconBtn(page)).toHaveText('📄');
	} finally {
		await owner.ctx.close();
	}
});
