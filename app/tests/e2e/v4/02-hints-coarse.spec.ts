// Card 02 C4: keyboard hints are rendered only for a fine pointer (D-V4-03, D-V4-15). A 900×700 touch
// screen is coarse but wider than the phone breakpoint, so this is the case the width rule alone misses.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 900, height: 700 }, hasTouch: true });

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

async function newPage(page: Page, title: string) {
	return page.evaluate(async (t) => {
		const r = await fetch('/api/pages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: t }),
		});
		return ((await r.json()) as { page: { id: string } }).page.id;
	}, title);
}

test('C4 coarse pointer: no key hints in the header, quick add or palette, and N does not open quick add', async ({
	page,
}) => {
	await signIn(page);
	await page.goto('/today');
	// the premise: a touch screen is a coarse pointer at this width (so not the phone layout)
	expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
	expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(false);

	const search = page.getByRole('banner').getByRole('button', { name: /^Search/ });
	await expect(search).toHaveAttribute('aria-label', 'Search');
	expect(await search.getAttribute('title')).toBeNull();
	await expect(search.locator('kbd')).toHaveCount(0);

	const opener = page.locator('.hdr .opener');
	await expect(opener).toBeVisible();
	await expect(opener.locator('kbd')).toHaveCount(0);

	await page.keyboard.press('n');
	const qa = page.getByRole('dialog', { name: 'Quick add' });
	await expect(qa).toHaveCount(0);
	await opener.click();
	await expect(qa).toBeVisible();
	await expect(qa.locator('.ft')).toHaveCount(0); // no Enter / / / Esc footer
	await page.keyboard.press('Escape');
	await expect(qa).toBeHidden();

	await search.click();
	await expect(page.getByRole('dialog', { name: 'Search and go' })).toBeVisible();
	await expect(page.getByText('↑↓ move · Enter open · Esc close')).toHaveCount(0);
	await page.keyboard.press('Escape');
});

test('C4 coarse pointer: the "/" menu has no keys footer', async ({ page }) => {
	await signIn(page);
	const id = await newPage(page, 'Coarse hints page');
	await page.goto(`/pages/${id}`);
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	const menu = page.getByRole('listbox', { name: 'Insert block' });
	await expect(menu).toBeVisible();
	await expect(menu.locator('.keys')).toBeHidden();
	await page.keyboard.press('Escape');
});
