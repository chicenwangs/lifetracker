// Card 07 C1/C3/C12 on phone: the Calendar feed section is under Planner in the phone Settings list, Back
// returns to Settings, Create shows the URL once, Copy flips to Copied, controls are 48 dp, no desktop copy.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

const FEED = 'code[aria-label="Your calendar feed link"]';
const EMPTY = 'No feed yet. Create a link to see your plan in another calendar.';
const ON = 'Feed is on. Anyone with the link can read your items.';

async function open(page: Page) {
	await page.goto('/settings/calendar-feed');
	const off = page.getByRole('button', { name: 'Turn off' });
	if (await off.isVisible().catch(() => false)) await off.click();
	await expect(page.getByRole('button', { name: 'Create feed link' })).toBeVisible();
}

test('C1/C12 phone Settings lists Calendar feed under Planner; Back returns to Settings', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/settings');
	const planner = page.locator('section', {
		has: page.getByRole('heading', { name: 'Planner', exact: true }),
	});
	const row = planner.getByRole('link', { name: 'Calendar feed' });
	await expect(row).toBeVisible();
	await row.click();
	await expect(page).toHaveURL(/\/settings\/calendar-feed$/);
	await expect(page.locator('.ptitle')).toHaveText('Calendar feed');
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();

	await expectTargets48(page);
	await noDesktopHints(page);

	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('link', { name: 'Calendar feed' })).toBeVisible();
});

test('C3/C12 on phone Create shows the URL once, Copy flips to Copied, Rotate/Turn off are 48 dp', async ({
	page,
}) => {
	await signIn(page);
	await open(page);
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Create feed link' }).click();
	const code = page.locator(FEED);
	await expect(code).toBeVisible();
	const url = (await code.innerText()).trim();
	expect(url).toMatch(/^http:\/\/localhost:\d+\/cal\/[A-Za-z0-9_-]{43}\.ics$/);
	await expect(page.locator('.toast')).toHaveCount(0); // C13: no undo toast

	await page.getByRole('button', { name: 'Copy' }).click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
	await expect(code).toHaveText(url);
	await expectTargets48(page);
	await noDesktopHints(page);

	await page.reload();
	await expect(page.getByText(ON, { exact: true })).toBeVisible();
	await expect(page.locator(FEED)).toHaveCount(0); // shown once
	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
});
