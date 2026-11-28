// Card 17 (O-3, D-V4-23, DESIGN §2.6, §3, §0): Page ⋯ Duplicate on desktop — the menu group and order,
// "Copy of <title>" right below the source with the same icon and blocks, the copy opens, Undo trashes it
// (restorable from Trash, source untouched), a shared page copies to the viewer, two duplicates are
// independent, a failed run creates nothing, the row is disabled while running, and record/archived pages hide it.
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

const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: b ? { 'content-type': 'application/json' } : undefined,
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: (await r.json().catch(() => null)) as Record<string, unknown> | null };
		},
		[m, p, b] as const,
	);

const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
async function mkPage(page: Page, title: string, content?: unknown[]) {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	expect(r.s).toBe(201);
	const id = (r.j as { page: { id: string } }).page.id;
	if (content) {
		expect((await api(page, 'PATCH', `/api/pages/${id}`, { doc: { type: 'doc', content } })).s).toBe(200);
	}
	return id;
}
const menu = (page: Page) => page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' });
const toast = (page: Page) => page.getByRole('status').filter({ hasText: 'Duplicated' });
const treeLinks = (page: Page) => page.getByRole('tree').getByRole('link');

/** a second account, the way the e2e suite makes one: invite-only for a moment, one code, then /signup */
async function partner(browser: Browser, admin: Page) {
	await admin.goto('/settings/users');
	await admin.locator('input[name="open"][value="0"]').check();
	await admin.getByRole('button', { name: 'Save' }).click();
	await expect(admin.getByText('Saved.')).toBeVisible();
	await admin.getByRole('button', { name: 'Make invite code' }).click();
	await expect(admin.locator('[role="status"] code').first()).toBeVisible();
	const code = (await admin.locator('[role="status"] code').first().innerText()).trim();
	const username = `duppartner${stamp()}`;
	const ctx = await browser.newContext();
	const p2 = await ctx.newPage();
	await p2.goto('/signup');
	await p2.fill('#code', code);
	await p2.fill('#nu', username);
	await p2.fill('#dn', 'Dup Partner');
	await p2.fill('#np', 'dup partner phrase');
	await p2.fill('#cp', 'dup partner phrase');
	await p2.getByRole('button', { name: 'Create account' }).click();
	await p2.waitForURL((u) => u.pathname === '/');
	const skip = p2.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	return { ctx, p: p2, username };
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('C7 Duplicate sits in the second menu group after Move to…; the toast says Duplicated · Undo and the copy is right below the original', async ({
	page,
}) => {
	const title = `Dup c7 ${stamp()}`;
	const nextTitle = `Dup c7 next ${stamp()}`;
	const id = await mkPage(page, title, [p('Alpha text')]);
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { icon: '📄' })).s).toBe(200);
	await mkPage(page, nextTitle);
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	const names = await page.getByRole('menuitem').allInnerTexts();
	const mv = names.findIndex((n) => n.trim() === 'Move to…');
	const dup = names.findIndex((n) => n.trim() === 'Duplicate');
	const copyLink = names.findIndex((n) => n.trim() === 'Copy link');
	expect(mv).toBeGreaterThanOrEqual(0);
	expect(dup).toBeGreaterThan(mv);
	expect(copyLink).toBeGreaterThan(dup);
	// a rule splits the groups, directly above Duplicate
	expect(
		await page
			.getByRole('menuitem', { name: 'Duplicate' })
			.evaluate((el) => el.previousElementSibling?.getAttribute('role') === 'separator'),
	).toBe(true);
	await page.getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect(toast(page)).toBeVisible();
	await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();
	// the original stays open
	await expect(page).toHaveURL(new RegExp(`/pages/${id}$`));
	await expect(page.getByLabel('Page title')).toHaveValue(title);
	// the sidebar tree shows the copy immediately below the source, before the next page
	const links = (await treeLinks(page).allInnerTexts()).map((t) => t.trim());
	// the source and the copy carry the 📄 icon, so their link text starts with it
	const at = links.findIndex((t) => t === `📄 ${title}`);
	expect(at).toBeGreaterThanOrEqual(0);
	expect(links[at + 1]).toBe(`📄 Copy of ${title}`);
	expect(links[at + 2]).toBe(nextTitle);
	// open the copy: same icon, same text
	await treeLinks(page)
		.filter({ hasText: `Copy of ${title}` })
		.click();
	await expect(page.getByLabel('Page title')).toHaveValue(`Copy of ${title}`);
	await expect(page.getByRole('button', { name: 'Page icon 📄' })).toBeVisible();
	await expect(page.getByLabel('Page content')).toContainText('Alpha text');
});

test('C2 the copy opens with the same blocks in the same order; the source row is untouched', async ({
	page,
}) => {
	const title = `Dup c2 ${stamp()}`;
	const id = await mkPage(page, title, [
		p('First line'),
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading two' }] },
		{ type: 'bulletList', content: [{ type: 'listItem', content: [p('Bullet one')] }] },
		{
			type: 'taskList',
			content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('Todo one')] }],
		},
	]);
	const before = (await api(page, 'GET', `/api/pages/${id}`)).j as {
		page: { revision: number; updatedAt: string; doc: unknown };
	};
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	await page.getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect(toast(page)).toBeVisible();
	// open the copy from the tree: same blocks in the same order
	await treeLinks(page)
		.filter({ hasText: `Copy of ${title}` })
		.click();
	for (const text of ['First line', 'Heading two', 'Bullet one', 'Todo one'])
		await expect(page.getByLabel('Page content')).toContainText(text);
	await expect(page.getByRole('checkbox').first()).toBeChecked();
	// the source row did not change
	const after = (await api(page, 'GET', `/api/pages/${id}`)).j as typeof before;
	expect(after.page.revision).toBe(before.page.revision);
	expect(after.page.updatedAt).toBe(before.page.updatedAt);
	expect(after.page.doc).toEqual(before.page.doc);
});

test('MUST type then Duplicate copies the typed title and text (editor + pending 500 ms title save flushed first)', async ({
	page,
}) => {
	const title = `Dup flush ${stamp()}`;
	const src = await mkPage(page, title);
	await page.goto(`/pages/${src}`);
	// slow every PATCH: without the flush the POST would race the pending saves and copy the old row
	const slow = (url: URL) => url.pathname === `/api/pages/${src}`;
	await page.route(slow, async (route) => {
		if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 800));
		await route.continue();
	});
	try {
		const typedTitle = `Typed title ${stamp()}`;
		const typedBody = `Typed body ${stamp()}`;
		await page.getByLabel('Page title').fill(typedTitle);
		await page.getByLabel('Page content').click();
		await page.keyboard.type(typedBody);
		// no waiting for either debounce (title 500 ms, editor 600 ms): straight to Duplicate
		await menu(page).click();
		await page.getByRole('menuitem', { name: 'Duplicate' }).click();
		await expect(toast(page)).toBeVisible();
		await treeLinks(page)
			.filter({ hasText: `Copy of ${typedTitle}` })
			.click();
		await expect(page.getByLabel('Page title')).toHaveValue(`Copy of ${typedTitle}`);
		await expect(page.getByLabel('Page content')).toContainText(typedBody);
		// the source kept the typed text/title too
		const srcDoc = (await api(page, 'GET', `/api/pages/${src}`)).j as {
			page: { title: string; doc: unknown };
		};
		expect(srcDoc.page.title).toBe(typedTitle);
		expect(JSON.stringify(srcDoc.page.doc)).toContain(typedBody);
	} finally {
		await page.unroute(slow);
	}
});

test('C8 Undo trashes the copy via DELETE (Trash restores it) and never touches the source', async ({
	page,
}) => {
	const title = `Dup c8 ${stamp()}`;
	const id = await mkPage(page, title, [p('Keep me')]);
	const before = (await api(page, 'GET', `/api/pages/${id}`)).j as {
		page: { revision: number };
	};
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	await page.getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect(toast(page)).toBeVisible();
	const copy = treeLinks(page).filter({ hasText: `Copy of ${title}` });
	await expect(copy).toHaveCount(1);
	const copyId = (await copy.getAttribute('href'))?.split('/').pop() as string;
	await toast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(copy).toHaveCount(0);
	expect((await api(page, 'GET', `/api/pages/${copyId}`)).s).toBe(404); // trashed, not deleted
	expect((await api(page, 'GET', `/api/pages/${id}`)).s).toBe(200);
	// still restorable from Trash
	await page.goto('/pages/trash');
	await expect(page.getByText(`Copy of ${title}`)).toBeVisible();
	await page.getByRole('button', { name: 'Restore' }).first().click();
	await expect(page.getByText('Restored')).toBeVisible();
	expect((await api(page, 'GET', `/api/pages/${copyId}`)).s).toBe(200);
	await page.goto('/pages');
	await expect(treeLinks(page).filter({ hasText: `Copy of ${title}` })).toHaveCount(1);
	// the source never became, or was deleted by, the copy
	const src = (await api(page, 'GET', `/api/pages/${id}`)).j as {
		page: { title: string; revision: number; doc: unknown };
	};
	expect(src.page.title).toBe(title);
	expect(src.page.revision).toBe(before.page.revision);
	expect(JSON.stringify(src.page.doc)).toContain('Keep me');
});

test('C6 a page shared with me offers Duplicate; the copy is mine, at my root, with no share', async ({
	page,
	browser,
}) => {
	const title = `Dup c6 ${stamp()}`;
	const id = await mkPage(page, title);
	// the source owner's own picture: a copy by someone else must not keep it (D-V4-23)
	const att = await page.evaluate(async (name) => {
		const bin = Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
			),
			(c) => c.charCodeAt(0),
		);
		const r = await fetch(`/api/attachments?name=${encodeURIComponent(name)}`, {
			method: 'POST',
			headers: { 'content-type': 'image/png' },
			body: bin,
		});
		return ((await r.json()) as { attachment: { id: string } }).attachment.id;
	}, `dup6-${stamp()}.png`);
	// a self-link plus the owner's image: the copy must resolve the link (never "unavailable") and drop the file
	expect(
		(
			await api(page, 'PATCH', `/api/pages/${id}`, {
				doc: {
					type: 'doc',
					content: [
						p('Shared body'),
						{ type: 'image', attrs: { src: `/api/attachments/${att}`, alt: 'Owner picture' } },
						{ type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId: id } }] },
					],
				},
			})
		).s,
	).toBe(200);
	const them = await partner(browser, page);
	try {
		expect(
			(await api(page, 'POST', `/api/shares/page/${id}`, { username: them.username, permission: 'view' })).s,
		).toBe(200);
		await them.p.goto(`/pages/${id}`);
		await them.p.getByText('Shared with you').waitFor();
		await menu(them.p).click();
		await expect(them.p.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
		await them.p.getByRole('menuitem', { name: 'Duplicate' }).click();
		await expect(toast(them.p)).toBeVisible();
		const copy = treeLinks(them.p).filter({ hasText: `Copy of ${title}` });
		await expect(copy).toHaveCount(1);
		const copyId = (await copy.getAttribute('href'))?.split('/').pop() as string;
		await copy.click();
		await expect(them.p).toHaveURL(new RegExp(`/pages/${copyId}$`));
		await expect(them.p.getByLabel('Page title')).toHaveValue(`Copy of ${title}`);
		const content = them.p.getByLabel('Page content');
		await expect(content).toContainText('Shared body');
		// the self-link resolves through the share, with the source's title
		await expect(content.locator('a.pl')).toHaveText('↗ ' + title);
		await expect(content.locator('a.pl')).toHaveAttribute('href', `/pages/${id}`);
		await expect(content).not.toContainText('Unavailable page');
		// the source owner's image node is gone (only the duplicator's files survive)
		await expect(content.locator('img[alt="Owner picture"]')).toHaveCount(0);
		const mine = (await api(them.p, 'GET', `/api/pages/${copyId}`)).j as {
			page: { access: string; title: string };
		};
		expect(mine.page.access).toBe('owner'); // never the source owner's
		expect(mine.page.title).toBe(`Copy of ${title}`);
		// no shares on the copy: the source owner cannot open it
		expect((await api(page, 'GET', `/api/pages/${copyId}`)).s).toBe(404);
		expect((await api(them.p, 'GET', `/api/shares/page/${copyId}`)).j).toMatchObject({ shares: [] });
		// the source is untouched and still theirs
		expect((await api(page, 'GET', `/api/pages/${id}`)).s).toBe(200);
	} finally {
		await them.ctx.close();
	}
});

test('C9 two duplicates are independent; a failed duplicate shows the error and creates nothing', async ({
	page,
}) => {
	const title = `Dup c9 ${stamp()}`;
	const id = await mkPage(page, title, [p('Original words')]);
	const one = (await api(page, 'POST', `/api/pages/${id}/duplicate`)).j as { page: { id: string } };
	expect((await api(page, 'PATCH', `/api/pages/${one.page.id}`, { doc: { type: 'doc', content: [p('only in one')] } })).s).toBe(200); // prettier-ignore
	const two = (await api(page, 'POST', `/api/pages/${id}/duplicate`)).j as { page: { id: string } };
	expect(two.page.id).not.toBe(one.page.id);
	const twoDoc = (await api(page, 'GET', `/api/pages/${two.page.id}`)).j as { page: { doc: unknown } };
	expect(JSON.stringify(twoDoc.page.doc)).toContain('Original words');
	expect(JSON.stringify(twoDoc.page.doc)).not.toContain('only in one');
	const before = ((await api(page, 'GET', '/api/pages')).j as { tree: unknown[] }).tree.length;
	// a server error: the existing error toast, nothing created
	await page.route(
		(url) => url.pathname.endsWith(`/api/pages/${id}/duplicate`),
		(route) =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: { code: 'boom', message: 'Disk full' } }),
			}),
	);
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	await page.getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect(page.getByRole('alert')).toContainText('Disk full');
	expect(((await api(page, 'GET', '/api/pages')).j as { tree: unknown[] }).tree.length).toBe(before);
	await page.unroute((url) => url.pathname.endsWith(`/api/pages/${id}/duplicate`));
});

test('C11 the Duplicate row is disabled while the request runs: a double click makes one copy', async ({
	page,
}) => {
	const title = `Dup c11 ${stamp()}`;
	const id = await mkPage(page, title);
	await page.route(
		(url) => url.pathname.endsWith(`/api/pages/${id}/duplicate`),
		async (route) => {
			await new Promise((r) => setTimeout(r, 600));
			await route.continue();
		},
	);
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	const dup = page.getByRole('menuitem', { name: 'Duplicate' });
	await dup.evaluate((b) => ((b as HTMLButtonElement).click(), (b as HTMLButtonElement).click()));
	await expect(dup).toBeDisabled();
	await expect(toast(page)).toBeVisible();
	const tree = ((await api(page, 'GET', '/api/pages')).j as { tree: { title: string }[] }).tree;
	expect(tree.filter((n) => n.title === `Copy of ${title}`)).toHaveLength(1);
	await page.unroute((url) => url.pathname.endsWith(`/api/pages/${id}/duplicate`));
});

test('C7 Duplicate is hidden on archived pages and on database record pages', async ({ page }) => {
	const title = `Dup hidden ${stamp()}`;
	const id = await mkPage(page, title);
	expect((await api(page, 'POST', `/api/pages/${id}/archive`)).s).toBe(200);
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0);
	// record page of a database
	const db = (await api(page, 'POST', '/api/databases', { title: `Dup db ${stamp()}` })).j as {
		database: { id: string };
	};
	const row = (await api(page, 'POST', `/api/databases/${db.database.id}/records`, {})).j as {
		row: { id: string };
	};
	const rec = (await api(page, 'POST', `/api/database-records/${row.row.id}/page`)).j as {
		pageId: string;
	};
	await page.goto(`/pages/${rec.pageId}`);
	await menu(page).click();
	await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0);
});
