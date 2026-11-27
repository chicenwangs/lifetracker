// Blind tests for card 07 on the phone projects, from its Done-when lines only: C12 (Planner list entry,
// Copy/Rotate/Turn off at 48 dp, Back, no desktop hints, URL inline). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import { HINTS, expectTargets48, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file
const EMPTY = 'No feed yet. Create a link to see your plan in another calendar.';

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

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	page = await ctx.newPage();
	await signIn(page);
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {
		origin: new URL(page.url()).origin,
	});
});
test.afterAll(() => page.context().close());

test('C12 phone: Calendar feed sits under Planner, Copy/Rotate/Turn off are 48 dp inline, Back returns and no desktop hints show', async () => {
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Planner' })).toBeVisible();
	const planner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Planner' }) });
	const link = planner.getByRole('link', { name: /^Calendar feed/ });
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(/\/settings\/calendar-feed$/);
	await expect(page.getByRole('banner')).toContainText('Calendar feed');

	// create or rotate until the one-time URL panel is open
	if (
		await page
			.getByRole('button', { name: 'Create feed link' })
			.isVisible()
			.catch(() => false)
	) {
		await page.getByRole('button', { name: 'Create feed link' }).click();
	} else {
		await page.getByRole('button', { name: 'Rotate' }).click();
	}
	const code = page.getByLabel('Your calendar feed link');
	await expect(code).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0); // inline, not a BottomSheet
	const url = (await code.innerText()).trim();

	// Copy / Rotate / Turn off are all >= 48 dp, and so is every other visible control
	for (const name of ['Copy', 'Rotate', 'Turn off']) {
		const box = await page.getByRole('button', { name, exact: true }).boundingBox();
		expect(box, name).not.toBeNull();
		expect(Math.round(box!.width), name).toBeGreaterThanOrEqual(48);
		expect(Math.round(box!.height), name).toBeGreaterThanOrEqual(48);
	}
	await expectTargets48(page);

	// Copy writes the URL to the clipboard and flips its label
	await page.getByRole('button', { name: 'Copy', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
	await noDesktopHints(page);

	// Back returns to the phone Settings list
	await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await noDesktopHints(page);

	// clean up: Turn off leaves the empty state
	await page.goto('/settings/calendar-feed');
	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
});
