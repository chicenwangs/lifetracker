// Blind tests for card 17 (duplicate page) on desktop, from its Done-when lines only:
// C7 (Duplicate in the second ⋯ group after Move to…, toast "Duplicated · Undo", the copy in the sidebar
// directly below the original, the original stays open), C2 (the copy opens with the same blocks),
// C8 (the toast Undo trashes the copy through DELETE, restorable from Trash, Ctrl+Z never touches it),
// C9 (two independent copies; a failed duplicate alerts and creates nothing), C11 (the row is disabled while
// the request runs so a double tap makes one copy; an empty page copies to an empty editor).
// No builder test was opened.
import { expect, test, type Page, type Route } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts may reset jeremy's password earlier in the run
const PREFIX = 'Blind17 ';

/** undo journal straight from the e2e DB (the screen cannot show "no row was written") */
function journalCount(): number {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return (db.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;
	} finally {
		db.close();
	}
}

let page: Page;
const made = new Set<string>();

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
	parentId: string | null;
	access: string;
}
async function makePage(title: string): Promise<PageDTO> {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const created = (r.json as { page: PageDTO }).page;
	made.add(created.id);
	return created;
}
async function tree(): Promise<{ id: string; title: string; parentId: string | null }[]> {
	return ((await api(page, 'GET', '/api/pages')).json as { tree: { id: string; title: string; parentId: string | null }[] }).tree; // prettier-ignore
}
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

const menuButton = () => page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' });
const menu = () => page.getByRole('menu');
async function openMenu() {
	await menuButton().click();
	await expect(menu()).toBeVisible();
}
const treeLink = (title: string) =>
	page.locator('nav[aria-label="Pages"]').getByRole('link', { name: title });

/** duplicate the open page through the menu: asserts one new page and returns it */
async function duplicateUI(srcId: string) {
	await openMenu();
	const before = new Set((await tree()).map((n) => n.id));
	const done = page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().endsWith(`/api/pages/${srcId}/duplicate`),
	);
	await menu().getByRole('menuitem', { name: 'Duplicate' }).click();
	expect((await done).status()).toBe(201);
	let fresh: { id: string; title: string }[] = [];
	await expect
		.poll(async () => {
			fresh = (await tree()).filter((n) => !before.has(n.id));
			return fresh.length;
		})
		.toBe(1);
	made.add(fresh[0]!.id);
	return fresh[0]!;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});

test.afterAll(async () => {
	await page.context().close();
});

test.afterEach(async () => {
	for (const id of [...made]) await api(page, 'DELETE', `/api/pages/${id}`).catch(() => {});
	made.clear();
});

// ---- C7 ----------------------------------------------------------------------------------------------------
test('C7 desktop: Duplicate is in the group after Move to…, shows "Duplicated · Undo", and the copy lands directly below the original; the original stays open', async () => {
	await makePage(PREFIX + 'C7 before');
	const src = await makePage(PREFIX + 'C7 source');
	await makePage(PREFIX + 'C7 after');
	await page.goto(`/pages/${src.id}`);
	await expect(page.getByLabel('Page title')).toHaveValue(PREFIX + 'C7 source');

	await openMenu();
	const items = menu().getByRole('menuitem');
	const labels = await items.allInnerTexts();
	const move = labels.findIndex((t) => t.startsWith('Move to'));
	const dup = labels.findIndex((t) => t === 'Duplicate');
	expect(move, labels.join(' | ')).toBeGreaterThanOrEqual(0);
	expect(dup, labels.join(' | ')).toBeGreaterThan(move);
	// second group: a rule separates it from the Move to…/Move up/Move down group
	expect(await items.nth(dup).evaluate((n) => n.previousElementSibling?.getAttribute('role'))).toBe(
		'separator',
	);

	const before = new Set((await tree()).map((n) => n.id));
	const done = page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().endsWith(`/api/pages/${src.id}/duplicate`),
	);
	await items.nth(dup).click();
	expect((await done).status()).toBe(201);

	const toast = page.locator('.toast');
	await expect(toast).toContainText('Duplicated');
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();

	let fresh: { id: string; title: string }[] = [];
	await expect
		.poll(async () => {
			fresh = (await tree()).filter((n) => !before.has(n.id));
			return fresh.length;
		})
		.toBe(1);
	expect(fresh[0]!.title).toBe('Copy of ' + PREFIX + 'C7 source');
	made.add(fresh[0]!.id);

	const titles = await page
		.locator('nav[aria-label="Pages"] ul[aria-label="Page tree"] > li > .row > a > .t')
		.allInnerTexts();
	const at = titles.indexOf(PREFIX + 'C7 source');
	expect(at, titles.join(' | ')).toBeGreaterThanOrEqual(0);
	expect(titles[at + 1]).toBe('Copy of ' + PREFIX + 'C7 source');

	// the original stays open
	await expect(page).toHaveURL(new RegExp(`/pages/${src.id}$`));
	await expect(page.getByLabel('Page title')).toHaveValue(PREFIX + 'C7 source');
});

// ---- C2 ----------------------------------------------------------------------------------------------------
test('C2 desktop: opening the copy in the editor shows the same paragraphs, heading, lists, to-do, table, image and page link', async () => {
	const target = await makePage(PREFIX + 'C2 target');
	const src = await makePage(PREFIX + 'C2 source');

	// upload a real 1x1 PNG so the image block is an owned file
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
		return { status: r.status, json: (await r.json().catch(() => null)) as { attachment?: { id: string } } };
	}, 'blind17.png');
	expect(att.status, JSON.stringify(att.json)).toBe(201);
	const img = `/api/attachments/${att.json.attachment!.id}`;

	const d = {
		type: 'doc',
		content: [
			para('Blind17 first paragraph'),
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Blind17 heading' }] },
			{ type: 'bulletList', content: [{ type: 'listItem', content: [para('Blind17 bullet one')] }] },
			{
				type: 'orderedList',
				attrs: { start: 1 },
				content: [{ type: 'listItem', content: [para('Blind17 ordered one')] }],
			},
			{
				type: 'taskList',
				content: [{ type: 'taskItem', attrs: { checked: true }, content: [para('Blind17 done thing')] }],
			},
			{
				type: 'table',
				content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('Blind17 cell')] }] }],
			},
			{ type: 'image', attrs: { src: img, alt: 'Blind17 pic' } },
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'see ' },
					{ type: 'pageLink', attrs: { pageId: target.id } },
				],
			},
		],
	};
	const saved = await api(page, 'PATCH', `/api/pages/${src.id}`, { doc: d });
	expect(saved.status, JSON.stringify(saved.json)).toBe(200);

	await page.goto(`/pages/${src.id}`);
	const editor = page.getByLabel('Page content');
	await expect(editor).toContainText('Blind17 first paragraph');
	const srcText = await editor.innerText();

	const copy = await duplicateUI(src.id);
	await expect(page.locator('.toast')).toContainText('Duplicated');
	await treeLink('Copy of ' + PREFIX + 'C2 source').click();
	await expect(page).toHaveURL(new RegExp(`/pages/${copy.id}$`));
	await expect(page.getByLabel('Page title')).toHaveValue('Copy of ' + PREFIX + 'C2 source');

	const copied = page.getByLabel('Page content');
	await expect(copied.getByRole('heading', { name: 'Blind17 heading' })).toBeVisible();
	await expect(copied).toContainText('Blind17 bullet one');
	await expect(copied).toContainText('Blind17 ordered one');
	await expect(copied.locator("ul[data-type='taskList'] li[data-checked='true']")).toContainText(
		'Blind17 done thing',
	);
	await expect(copied.locator('table')).toContainText('Blind17 cell');
	await expect(copied.locator('img[alt="Blind17 pic"]')).toBeVisible();
	await expect(copied.locator('a.pl')).toHaveText('↗ ' + PREFIX + 'C2 target');
	await expect(copied.locator('a.pl')).toHaveAttribute('href', `/pages/${target.id}`);
	expect(await copied.innerText()).toBe(srcText); // same rendering, block for block
});

// ---- C8 ----------------------------------------------------------------------------------------------------
test('C8 desktop: the toast Undo trashes the copy through DELETE and Trash can restore it; Ctrl+Z never touches a copy', async () => {
	const src = await makePage(PREFIX + 'C8 source');
	await page.goto(`/pages/${src.id}`);
	await openMenu();
	const before = new Set((await tree()).map((n) => n.id));
	await menu().getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect(page.locator('.toast')).toContainText('Duplicated');
	let fresh: { id: string; title: string }[] = [];
	await expect
		.poll(async () => {
			fresh = (await tree()).filter((n) => !before.has(n.id));
			return fresh.length;
		})
		.toBe(1);
	const copy = fresh[0]!;
	made.add(copy.id);

	const deleted = page.waitForResponse(
		(r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/pages/${copy.id}`),
	);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	expect((await deleted).status()).toBe(200);
	await expect(treeLink('Copy of ' + PREFIX + 'C8 source')).toHaveCount(0);
	expect((await api(page, 'GET', `/api/pages/${copy.id}`)).status).toBe(404);
	expect((await api(page, 'GET', `/api/pages/${src.id}`)).status).toBe(200);

	// restorable from Trash
	await page.goto('/pages/trash');
	const row = page.locator('.row', { hasText: 'Copy of ' + PREFIX + 'C8 source' });
	await expect(row).toBeVisible();
	await expect(row.getByRole('button', { name: 'Restore' })).toBeVisible();

	// no journal row: the global undo has nothing to replay, and Ctrl+Z on a page stays in the editor
	await page.goto(`/pages/${src.id}`);
	const journalBefore = journalCount();
	const copy2 = await duplicateUI(src.id);
	await expect(page.locator('.toast')).toContainText('Duplicated');
	expect(journalCount()).toBe(journalBefore); // the duplicate wrote no undo_actions row
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('Control+z');
	await expect(treeLink('Copy of ' + PREFIX + 'C8 source')).toHaveCount(1);
	expect((await api(page, 'GET', `/api/pages/${copy2.id}`)).status).toBe(200);
	expect((await api(page, 'GET', `/api/pages/${src.id}`)).status).toBe(200);
});

// ---- C9 ----------------------------------------------------------------------------------------------------
test('C9 desktop: duplicating twice makes two independent copies; a failed duplicate alerts and creates nothing', async () => {
	const src = await makePage(PREFIX + 'C9 source');
	await page.goto(`/pages/${src.id}`);
	const one = await duplicateUI(src.id);
	await expect(page.locator('.toast')).toContainText('Duplicated');
	const two = await duplicateUI(src.id);
	expect(two.id).not.toBe(one.id);
	expect(two.title).toBe('Copy of ' + PREFIX + 'C9 source');

	// independent: trashing one leaves the other
	expect((await api(page, 'DELETE', `/api/pages/${one.id}`)).status).toBe(200);
	expect((await api(page, 'GET', `/api/pages/${one.id}`)).status).toBe(404);
	expect((await api(page, 'GET', `/api/pages/${two.id}`)).status).toBe(200);
	await page.reload(); // the API delete above is outside the page's own invalidation
	await expect(treeLink('Copy of ' + PREFIX + 'C9 source')).toHaveCount(1);

	// a 500 from the route: the existing error toast, the menu closes, nothing is created
	const fail = (url: URL) => url.pathname === `/api/pages/${src.id}/duplicate`;
	await page.route(fail, (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'boom', message: 'Blind17 failed duplicate.' } }),
		}),
	);
	const countBefore = (await tree()).length;
	await openMenu();
	await menu().getByRole('menuitem', { name: 'Duplicate' }).click();
	const alert = page.locator('.toast.error');
	await expect(alert).toBeVisible();
	await expect(alert).toHaveAttribute('role', 'alert');
	await expect(alert).toContainText('Blind17 failed duplicate.');
	await expect(menu()).toHaveCount(0);
	expect((await tree()).length).toBe(countBefore);
	await page.unroute(fail);
});

// ---- C11 ----------------------------------------------------------------------------------------------------
test('C11 desktop: Duplicate is disabled while the request runs (a double tap makes one copy); an empty page copies empty with the editor prompt', async () => {
	const src = await makePage(PREFIX + 'C11 slow');
	await page.goto(`/pages/${src.id}`);
	const dupUrl = `/api/pages/${src.id}/duplicate`;
	const isDup = (url: URL) => url.pathname === dupUrl;
	const handler = async (route: Route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await new Promise((r) => setTimeout(r, 1200));
		await route.continue();
	};
	await page.route(isDup, handler);
	try {
		await openMenu();
		const row = menu().getByRole('menuitem', { name: 'Duplicate' });
		const before = new Set((await tree()).map((n) => n.id));
		const done = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(dupUrl));
		await row.click();
		await expect(row).toBeDisabled(); // loading state = the row cannot fire twice
		await row.dispatchEvent('click'); // a second tap while the first is in flight
		expect((await done).status()).toBe(201);
		let fresh: { id: string; title: string }[] = [];
		await expect
			.poll(async () => {
				fresh = (await tree()).filter((n) => !before.has(n.id));
				return fresh.length;
			})
			.toBe(1);
		made.add(fresh[0]!.id);
	} finally {
		await page.unroute(isDup, handler);
	}

	// empty: the copy opens empty (one empty paragraph, no blocks) with the same editor prompt a new page has
	const empty = await makePage('');
	await page.goto(`/pages/${empty.id}`);
	const emptyCopy = await duplicateUI(empty.id);
	expect(emptyCopy.title).toBe('Copy of Untitled');
	const copyDoc = (await api(page, 'GET', `/api/pages/${emptyCopy.id}`)).json as {
		page: { doc: { content: unknown[] } };
	};
	expect(copyDoc.page.doc.content).toEqual([]);
	await treeLink('Copy of Untitled').click();
	await expect(page.getByLabel('Page title')).toHaveValue('Copy of Untitled');
	const editor = page.getByLabel('Page content');
	await expect(editor).toBeVisible();
	expect((await editor.innerText()).trim()).toBe('');
	const paragraphs = page.locator('.doc .pm p');
	await expect(paragraphs).toHaveCount(1);
	const dom = await paragraphs.first().evaluate((n) => ({
		html: n.innerHTML,
		text: n.textContent ?? '',
	}));
	expect(dom.text).toBe('');
	expect(dom.html.replace(/<br[^>]*>/g, '')).toBe(''); // no content, just the caret helper
	await expect(page.getByText('Type / for blocks')).toBeVisible(); // the editor prompt on desktop
});
