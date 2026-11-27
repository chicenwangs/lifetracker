// Blind test for card 12 on the phone projects, from its Done-when line only: C10.
// No builder test was opened.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { HINTS, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop run resets jeremy's password

let page: Page;

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		for (const pw of [PW, RESET_PW]) {
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

const sizeOf = async (el: Locator) => {
	const b = await el.boundingBox();
	expect(b, await el.innerText().catch(() => '?')).not.toBeNull();
	return b!;
};

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(async () => {
	await page
		.evaluate(() =>
			fetch('/api/me/prefs', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ digestTime: null }),
			}),
		)
		.catch(() => {});
	await page.context().close();
});

test('C10 phone: the Daily agenda row and its Off | On / time controls are ≥ 48 dp, Back returns to the Settings list, no key hints, and the preview chip wraps without sideways scrolling', async () => {
	// Settings list → the Notifications section (in-app history, so Back is the header Back)
	await page.goto('/settings');
	const row = page.getByRole('link', { name: 'Notifications' });
	await expect(row).toBeVisible();
	await row.click();
	await expect(page).toHaveURL(/\/settings\/notifications$/);
	await expect(page.getByRole('heading', { name: 'Daily agenda' })).toBeVisible();
	await expect(
		page.getByText("One notification a day with today's items and blocks. Nothing on → no notification.", {
			exact: true,
		}),
	).toBeVisible();

	// the segmented control is a real group with two 48 dp buttons
	const group = page.getByRole('group', { name: 'Daily agenda' });
	const off = group.getByRole('button', { name: 'Off', exact: true });
	const on = group.getByRole('button', { name: 'On', exact: true });
	await expect(off).toBeVisible();
	await expect(on).toBeVisible();
	for (const b of [off, on]) {
		const box = await sizeOf(b);
		expect(Math.round(box.height), await b.innerText()).toBeGreaterThanOrEqual(48);
		expect(Math.round(box.width), await b.innerText()).toBeGreaterThanOrEqual(48);
	}

	// the time field appears when On and is also a 48 dp target
	await on.click();
	const time = page.getByLabel('Daily agenda time');
	await expect(time).toBeVisible();
	await expect(time).toHaveValue('07:30');
	const timeBox = await sizeOf(time);
	expect(Math.round(timeBox.height)).toBeGreaterThanOrEqual(48);
	expect(Math.round(timeBox.width)).toBeGreaterThanOrEqual(48);

	// the preview chip stays inside the viewport and the page never scrolls sideways
	const viewport = page.viewportSize()!;
	const chip = page.locator('.preview');
	await expect(chip).toBeVisible();
	const chipBox = await sizeOf(chip);
	expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(viewport.width + 1);
	expect(chipBox.width).toBeLessThanOrEqual(viewport.width);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(1);

	// phone wording only
	await noDesktopHints(page);

	// Back returns to the Settings list
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('link', { name: 'Notifications' })).toBeVisible();
});
