// Blind tests for card 16 (page emoji icon) on the phone projects, from C1 and C6:
// C1 (the entry is the page ⋯ sheet row "Add icon", the icon shows at 44 px, no button beside the title),
// C6 (BottomSheet, 6 columns of 48 dp cells, Back closes it before the page, 48 dp targets and no desktop
// hints with the picker open). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import { HINTS, expectTargets48, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file
const PREFIX = 'Blind16 ';

let page: Page;
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
async function makePage(title: string, icon?: string): Promise<string> {
	const r = await api(page, 'POST', '/api/pages', { parentId: null, title });
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const id = (r.json as { page: { id: string } }).page.id;
	made.push(id);
	if (icon) {
		const set = await api(page, 'PATCH', `/api/pages/${id}`, { icon });
		expect(set.status, JSON.stringify(set.json)).toBe(200);
	}
	return id;
}
const pageMenu = () => page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' });
const sheet = () => page.getByRole('dialog', { name: 'Icon' });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	page = await ctx.newPage();
	await signIn(page);
});
test.afterAll(async () => {
	for (const id of made.splice(0)) await api(page, 'DELETE', `/api/pages/${id}`).catch(() => {});
	await page.context().close();
});
test.afterEach(async () => {
	for (const id of made.splice(0)) await api(page, 'DELETE', `/api/pages/${id}`);
});

// ---- C1 ----------------------------------------------------------------------------------------------------
test('C1 phone: "Add icon" is the page ⋯ sheet row, no button beside the title, and the icon itself is 44 px', async () => {
	const empty = await makePage(PREFIX + 'C1 empty');
	await page.goto(`/pages/${empty}`);
	await expect(page.getByLabel('Page title')).toHaveValue(PREFIX + 'C1 empty');

	// no desktop-style icon button on the phone
	await expect(page.locator('.iconwrap')).toBeHidden();
	await expect(page.locator('.iconwrap button')).toBeHidden();
	// the entry is the ⋯ sheet row
	await pageMenu().click();
	const row = page.getByRole('menuitem', { name: 'Add icon' });
	await expect(row).toBeVisible();
	await page.goBack(); // Back closes the menu
	await expect(page.getByRole('menuitem', { name: 'Add icon' })).toHaveCount(0);
	await expect(page.getByLabel('Page title')).toBeVisible();

	// an existing icon displays at 44 px, read-only entry in the ⋯ sheet, no picker
	const withIcon = await makePage(PREFIX + 'C1 icon', '🎓');
	await page.goto(`/pages/${withIcon}`);
	const shown = page.locator('.picon');
	await expect(shown).toBeVisible();
	await expect(shown).toHaveAttribute('aria-label', 'Page icon');
	await expect(shown).toHaveText('🎓');
	expect(await shown.evaluate((n) => getComputedStyle(n).fontSize)).toBe('44px');
	await expect(page.locator('.iconwrap')).toBeHidden();
	await expect(sheet()).toHaveCount(0);
});

// ---- C6 ----------------------------------------------------------------------------------------------------
test('C6 the picker is the BottomSheet with 6 columns of 48 dp cells; 48 dp targets and no desktop hints with it open; Back closes it before the page', async () => {
	const id = await makePage(PREFIX + 'C6');
	await page.goto(`/pages/${id}`);
	await pageMenu().click();
	await page.getByRole('menuitem', { name: 'Add icon' }).click();

	const dlg = sheet();
	await expect(dlg).toBeVisible();
	// the shared bottom sheet, not a desktop popover
	await expect(dlg.getByRole('button', { name: /Expand sheet|Collapse sheet/ })).toBeVisible();
	await expect(dlg.getByRole('button', { name: 'Close' })).toBeVisible();

	// 6 columns of 48 dp cells
	const cells = dlg.locator('.cell');
	await expect(cells).toHaveCount(40);
	const css = await dlg.locator('.grid').evaluate((n) => {
		const s = getComputedStyle(n);
		return { cols: s.gridTemplateColumns, rows: s.gridAutoRows };
	});
	expect(css.cols.split(' ')).toHaveLength(6);
	expect(new Set(css.cols.split(' '))).toEqual(new Set(['48px']));
	expect(css.rows).toBe('48px');
	for (const cell of await cells.all()) {
		const b = await cell.boundingBox();
		expect(b).not.toBeNull();
		expect(Math.round(b!.width)).toBe(48);
		expect(Math.round(b!.height)).toBe(48);
	}

	// phone rules with the picker open
	await noDesktopHints(page);
	await expectTargets48(page);
	await expect(dlg.locator('[title*="Esc"], [aria-label*="Esc"]')).toHaveCount(0);

	// Back closes the sheet first (one layer), the page stays
	await page.goBack();
	await expect(sheet()).toHaveCount(0);
	expect(new URL(page.url()).pathname).toBe(`/pages/${id}`);
	await expect(page.getByLabel('Page title')).toBeVisible();
	await noDesktopHints(page);
});
