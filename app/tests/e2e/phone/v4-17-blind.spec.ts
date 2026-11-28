// Blind tests for card 17 (duplicate page) on the phone projects, from C10/C11 only:
// C10 (Duplicate is a row in the page actions surface, its row is ≥ 48 dp, the copy opens from the phone
// Pages tree, Back works and no desktop wording appears), C11 (an empty page copies to an empty editor with
// the prompt; offline shows the usual error toast and queues nothing). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import { HINTS, expectTappable, expectTargets48, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file
const PREFIX = 'Blind17 ';

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
	await setHints(p, HINTS);
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
async function makePage(title: string): Promise<{ id: string; title: string }> {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const created = (r.json as { page: { id: string; title: string } }).page;
	made.add(created.id);
	return created;
}
async function tree(): Promise<{ id: string; title: string }[]> {
	return ((await api(page, 'GET', '/api/pages')).json as { tree: { id: string; title: string }[] }).tree;
}
const menuButton = () => page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' });
const menuRow = (name: string) => page.getByRole('menuitem', { name });
const treeLink = (title: string) =>
	page.locator('nav[aria-label="Pages"]').getByRole('link', { name: title });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	page = await ctx.newPage();
	await signIn(page);
});
test.afterAll(async () => {
	await page.context().close();
});
test.afterEach(async () => {
	for (const id of [...made]) await api(page, 'DELETE', `/api/pages/${id}`).catch(() => {});
	made.clear();
});

// ---- C10 ----------------------------------------------------------------------------------------------------
test('C10 phone: Duplicate is a ≥ 48 dp row in the page menu, the copy opens from the Pages tree and Back returns', async () => {
	const src = await makePage(PREFIX + 'C10 source');
	await page.goto(`/pages/${src.id}`);
	await expect(page.getByLabel('Page title')).toHaveValue(PREFIX + 'C10 source');

	await menuButton().click();
	const row = menuRow('Duplicate');
	await expect(row).toBeVisible();
	const box = (await row.boundingBox())!;
	expect(Math.round(box.height)).toBeGreaterThanOrEqual(48);
	await expectTappable(row);
	await expectTargets48(page); // includes the open page menu's rows
	await noDesktopHints(page);

	const before = new Set((await tree()).map((n) => n.id));
	const done = page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().endsWith(`/api/pages/${src.id}/duplicate`),
	);
	await row.click();
	expect((await done).status()).toBe(201);
	await expect(page.locator('.toast')).toContainText('Duplicated');
	let fresh: { id: string; title: string }[] = [];
	await expect
		.poll(async () => {
			fresh = (await tree()).filter((n) => !before.has(n.id));
			return fresh.length;
		})
		.toBe(1);
	made.add(fresh[0]!.id);

	// the copy is reachable by tap from the phone Pages tree
	await page.goto('/pages');
	await expect(treeLink('Copy of ' + PREFIX + 'C10 source')).toBeVisible();
	await treeLink('Copy of ' + PREFIX + 'C10 source').click();
	await expect(page).toHaveURL(new RegExp(`/pages/${fresh[0]!.id}$`));
	await expect(page.getByLabel('Page title')).toHaveValue('Copy of ' + PREFIX + 'C10 source');
	await expect(page.getByLabel('Page content')).toBeVisible();

	// Back works as before: the Pages index, with the tree still there
	await page.goBack();
	await expect(page).toHaveURL(/\/pages$/);
	await expect(page.locator('nav[aria-label="Pages"]')).toBeVisible();
});

// ---- C11 ----------------------------------------------------------------------------------------------------
test('C11 phone: an empty page copies to an empty editor with the prompt; offline shows the usual error toast and creates nothing', async () => {
	const empty = await makePage('');
	await page.goto(`/pages/${empty.id}`);
	await menuButton().click();
	const before = new Set((await tree()).map((n) => n.id));
	const done = page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().endsWith(`/api/pages/${empty.id}/duplicate`),
	);
	await menuRow('Duplicate').click();
	expect((await done).status()).toBe(201);
	await expect(page.locator('.toast')).toContainText('Duplicated');
	let fresh: { id: string; title: string }[] = [];
	await expect
		.poll(async () => {
			fresh = (await tree()).filter((n) => !before.has(n.id));
			return fresh.length;
		})
		.toBe(1);
	made.add(fresh[0]!.id);
	expect(fresh[0]!.title).toBe('Copy of Untitled');

	await page.goto(`/pages/${fresh[0]!.id}`);
	await expect(page.getByLabel('Page title')).toHaveValue('Copy of Untitled');
	const copyDoc = (await api(page, 'GET', `/api/pages/${fresh[0]!.id}`)).json as {
		page: { doc: { content: unknown[] } };
	};
	expect(copyDoc.page.doc.content).toEqual([]); // an empty copy holds no blocks
	const editor = page.getByLabel('Page content');
	await expect(editor).toBeVisible();
	expect((await editor.innerText()).trim()).toBe('');
	const paragraphs = page.locator('.doc .pm p');
	await expect(paragraphs).toHaveCount(1);
	expect((await paragraphs.first().innerText()).trim()).toBe(''); // the empty editor prompt state

	// offline: the usual error toast, and nothing is queued or created
	const count = (await tree()).length;
	await page.goto(`/pages/${empty.id}`);
	await page.context().setOffline(true);
	try {
		await menuButton().click();
		await menuRow('Duplicate').click();
		const error = page.locator('.toast.error');
		await expect(error).toBeVisible();
		await expect(error).toContainText(/offline/i);
	} finally {
		await page.context().setOffline(false);
	}
	expect((await tree()).length).toBe(count); // no copy appeared
	await expect(page.getByLabel('Page title')).toHaveValue('');
});
