// Card 17 (D-V4-23, DESIGN §0, §2.6, board M-P5): the phone page ⋯ surface gets a 48 dp Duplicate row,
// the copy lands in the phone Pages tree and opens, Back still works, no desktop wording, and a double tap
// on a slow request makes one copy.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, expectTappable, noDesktopHints, signIn } from './helpers';

const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
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
async function mkPage(page: Page, title: string, text?: string) {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	const id = (r.j as { page: { id: string } }).page.id;
	if (text)
		await api(page, 'PATCH', `/api/pages/${id}`, {
			doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
		});
	return id;
}
const menu = (page: Page) => page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' });
const dupRow = (page: Page) => page.getByRole('menuitem', { name: 'Duplicate' });
const toast = (page: Page) => page.getByRole('status').filter({ hasText: 'Duplicated' });

test.describe.configure({ mode: 'serial' });
let page: Page;
let title = '';
let id = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	title = `Phone dup ${info.project.name} ${stamp()}`;
	id = await mkPage(page, title, 'Phone body words');
});

test.afterAll(() => page.context().close());

test('C10 Duplicate is a 48 dp row in the page actions surface; the copy opens from the Pages tree and Back works', async () => {
	await page.goto(`/pages/${id}`);
	await menu(page).click();
	await expect(dupRow(page)).toBeVisible();
	await expectTappable(dupRow(page));
	const box = (await dupRow(page).boundingBox())!;
	expect(Math.round(box.height)).toBeGreaterThanOrEqual(48);
	await expectTargets48(page);
	await noDesktopHints(page);
	await dupRow(page).click();
	await expect(toast(page)).toBeVisible();
	await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();
	// the copy is in the phone tree (All pages) at my root
	await page.goto('/pages');
	const copy = page.getByRole('tree').getByRole('link', { name: `Copy of ${title}` });
	await expect(copy).toBeVisible();
	await copy.click();
	await expect(page).toHaveURL(/\/pages\/pg_/);
	await expect(page.getByLabel('Page title')).toHaveValue(`Copy of ${title}`);
	await expect(page.getByLabel('Page content')).toContainText('Phone body words');
	await noDesktopHints(page);
	await page.goBack();
	await expect(page).toHaveURL(/\/pages\/?$/);
});

test('C11 an empty page duplicates to an empty copy; a double tap on a slow request makes one copy', async () => {
	const emptyTitle = `Phone empty ${stamp()}`;
	const empty = await mkPage(page, emptyTitle);
	await page.goto(`/pages/${empty}`);
	await menu(page).click();
	await dupRow(page).click();
	await expect(toast(page)).toBeVisible();
	await page.goto('/pages');
	const emptyCopy = page.getByRole('tree').getByRole('link', { name: `Copy of ${emptyTitle}` });
	const copyId = (await emptyCopy.getAttribute('href'))?.split('/').pop() as string;
	await emptyCopy.click();
	await expect(page).toHaveURL(new RegExp(`/pages/${copyId}$`));
	await expect(page.getByLabel('Page content')).toBeVisible();
	const doc = (await api(page, 'GET', `/api/pages/${copyId}`)).j as { page: { doc: { content: unknown[] } } };
	expect(doc.page.doc.content).toEqual([]);
	// one slow request, two taps -> one copy
	const twiceTitle = `Phone twice ${stamp()}`;
	const again = await mkPage(page, twiceTitle);
	await page.route(
		(url) => url.pathname.endsWith(`/api/pages/${again}/duplicate`),
		async (route) => {
			await new Promise((r) => setTimeout(r, 600));
			await route.continue();
		},
	);
	await page.goto(`/pages/${again}`);
	await menu(page).click();
	await dupRow(page).evaluate((b) => ((b as HTMLButtonElement).click(), (b as HTMLButtonElement).click()));
	await expect(dupRow(page)).toBeDisabled();
	await expect(dupRow(page)).toHaveCount(0); // the reply arrived: the menu closes
	const tree = ((await api(page, 'GET', '/api/pages')).j as { tree: { title: string }[] }).tree;
	expect(tree.filter((n) => n.title === `Copy of ${twiceTitle}`)).toHaveLength(1);
	await page.unroute((url) => url.pathname.endsWith(`/api/pages/${again}/duplicate`));
});
