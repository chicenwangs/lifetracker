// Blind tests for card 14 (type starter pack) on the phone projects, from C10 only: the "+ Add a preset ▾"
// button and every menu row are 48 dp, the menu is the shared BottomSheet reached by tap, no desktop wording,
// and Back closes the open sheet before leaving Settings. No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import { HINTS, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file

let page: Page;

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
interface TypeDTO {
	id: string;
	name: string;
	builtin: boolean;
}
const listTypes = async (): Promise<TypeDTO[]> =>
	((await api(page, 'GET', '/api/item-types')).json as { types: TypeDTO[] }).types;

const presetBtn = () => page.getByRole('button', { name: /Add a preset/ });
const sheet = () => page.getByRole('dialog', { name: 'Add a preset' });
const rows = () => sheet().locator('.preset');

/** the shared DB may be at the cap from an earlier spec: free the slots this card's own rows would need */
async function freeSlots() {
	const all = await listTypes();
	if (all.length < 10) return;
	for (const t of all.filter((x) => !x.builtin))
		await api(page, 'DELETE', `/api/item-types/${t.id}`, { moveTo: null });
	expect((await listTypes()).length).toBeLessThan(10);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	page = await ctx.newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

// ---- C10 --------------------------------------------------------------------------------------------------
test('C10 the preset button and every sheet row are 48 dp, the menu is the shared tap sheet, no desktop hints, Back closes it first', async () => {
	await freeSlots();
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Planner' })).toBeVisible();
	const planner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Planner' }) });
	await planner.getByRole('link', { name: /^Item types/ }).click();
	await expect(page).toHaveURL(/\/settings\/types$/);
	await expect(page.getByRole('banner')).toContainText('Item types');

	// the button itself is a 48 dp target, visible without any hover
	const btn = presetBtn();
	await expect(btn).toBeVisible();
	const box = await btn.boundingBox();
	expect(box).not.toBeNull();
	expect(Math.round(box!.height)).toBeGreaterThanOrEqual(48);
	expect(Math.round(box!.width)).toBeGreaterThanOrEqual(48);
	await noDesktopHints(page);

	// a tap opens the shared bottom sheet (grab handle + Close), not a desktop popover
	await btn.click();
	const dlg = sheet();
	await expect(dlg).toBeVisible();
	await expect(dlg.getByRole('button', { name: /Expand sheet|Collapse sheet/ })).toBeVisible();
	await expect(dlg.getByRole('button', { name: 'Close' })).toBeVisible();

	// all five rows, each a 48 dp tap target with a dot and a name
	await expect(rows()).toHaveCount(5);
	expect(await rows().evaluateAll((ns) => ns.map((n) => n.textContent?.trim()))).toEqual([
		'Class',
		'Errand',
		'Health',
		'Chore',
		'Study',
	]);
	for (const r of await rows().all()) {
		const b = await r.boundingBox();
		expect(b).not.toBeNull();
		expect(Math.round(b!.height)).toBeGreaterThanOrEqual(48);
		expect(Math.round(b!.width)).toBeGreaterThanOrEqual(48);
	}
	await noDesktopHints(page); // no "Click", "Ctrl" or key hints in the sheet either

	// Back closes the sheet and stays on Settings › Types
	await page.goBack();
	await expect(sheet()).toHaveCount(0);
	await expect(page).toHaveURL(/\/settings\/types$/);

	// a second Back leaves Settings for the Settings list
	await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('link', { name: /^Item types/ })).toBeVisible();
	await noDesktopHints(page);
});
