// Card 02 C5: with a fine pointer (1440×900, the default desktop project) every keyboard hint stays as it
// was — header search, the Add hint, QuickAdd's footer, the palette footer and the "/" menu footer.
import { expect, test, type Page } from '@playwright/test';

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

test('C5 fine pointer: the search, Add, QuickAdd and palette hints are still shown', async ({ page }) => {
	await signIn(page);
	await page.goto('/today');
	expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);

	const search = page.getByRole('banner').getByRole('button', { name: /^Search/ });
	await expect(search).toHaveAttribute('aria-label', /^Search (Ctrl|⌘)\+K$/);
	await expect(search).toHaveAttribute('title', 'Search  Ctrl+K');
	await expect(search.locator('kbd')).toBeVisible();
	await expect(search.locator('kbd')).toHaveText(/(Ctrl|⌘)\+K/);

	const opener = page.locator('.hdr .opener');
	await expect(opener.locator('kbd')).toBeVisible();
	await expect(opener.locator('kbd')).toHaveText('N');
	await opener.click();
	const qa = page.getByRole('dialog', { name: 'Quick add' });
	await expect(qa).toBeVisible();
	await expect(qa.locator('.ft')).toBeVisible();
	await expect(qa.locator('.ft')).toContainText('Enter');
	await page.keyboard.press('Escape');
	await expect(qa).toBeHidden();

	await search.click();
	const pal = page.getByRole('dialog', { name: 'Search and go' });
	await expect(pal).toBeVisible();
	await expect(pal.locator('.keys')).toBeVisible();
	await expect(pal.locator('.keys')).toContainText('Esc close');
	await page.keyboard.press('Escape');
});

test('C5 fine pointer: the "/" menu keys footer is still shown', async ({ page }) => {
	await signIn(page);
	const id = await page.evaluate(async () => {
		const r = await fetch('/api/pages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Desktop hints page' }),
		});
		return ((await r.json()) as { page: { id: string } }).page.id;
	});
	await page.goto(`/pages/${id}`);
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	const menu = page.getByRole('listbox', { name: 'Insert block' });
	await expect(menu).toBeVisible();
	await expect(menu.locator('.keys')).toBeVisible();
	await expect(menu.locator('.keys')).toContainText('Esc cancel');
});
