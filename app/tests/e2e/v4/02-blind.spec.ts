// Blind tests for card 02, C4 and C5 (and C8 at 1440): keyboard hints follow the pointer, not the width.
// A 900x700 touch screen is coarse but wider than the phone breakpoint; a 1440x900 mouse screen is fine.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from '../phone/helpers';

async function makePage(page: Page, title: string) {
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/pages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: t }),
		});
		if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
		return ((await r.json()) as { page: { id: string } }).page.id;
	}, title);
	return `/pages/${id}`;
}

test.describe('C4 coarse pointer at desktop width', () => {
	test.use({ viewport: { width: 900, height: 700 }, hasTouch: true });

	test('C4 coarse pointer: no key hints and N does not open QuickAdd', async ({ page }) => {
		await signIn(page);
		// the premise: coarse pointer, but not the phone layout (so the width rule alone would show the hints)
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(false);
		expect(
			await page.evaluate(
				() => matchMedia('(max-width: 699px), (pointer: coarse) and (max-height: 500px)').matches,
			),
		).toBe(false);

		const pagePath = await makePage(page, 'Blind coarse page');
		await page.goto('/today');
		const header = page.getByRole('banner');
		const search = header.getByRole('button', { name: /^Search/ });
		const add = header.getByRole('button', { name: /^Add/ });

		// header search hint: not visible, not in the accessible name, not in title
		await expect(search).toHaveAccessibleName('Search');
		expect(await search.getAttribute('title')).toBeNull();
		await expect(search.locator('kbd')).toHaveCount(0);
		expect(await page.locator('[aria-label*="Ctrl"]').count()).toBe(0);
		expect(await page.locator('[title*="Ctrl"]').count()).toBe(0);

		// Add hint: the opener reads just "Add" and has no N kbd
		await expect(add).toHaveAccessibleName('Add');
		await expect(add.locator('kbd')).toHaveCount(0);

		// N is just a letter on a touch screen: QuickAdd stays closed
		await page.keyboard.press('n');
		await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeHidden();

		// opened by tap: the footer hints are gone, and not in an accessible name
		await add.click();
		const qa = page.getByRole('dialog', { name: 'Quick add' });
		await expect(qa).toBeVisible();
		await expect(qa.getByText('Enter')).toBeHidden();
		await expect(qa.getByText('Esc')).toBeHidden();
		await expect(qa.locator('[title*="Esc"], [aria-label*="Esc"]')).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(qa).toBeHidden();

		// search palette footer
		await search.click();
		const pal = page.getByRole('dialog', { name: 'Search and go' });
		await expect(pal).toBeVisible();
		await expect(pal.getByText(/Enter open/)).toBeHidden();
		await expect(pal.getByText(/Esc close/)).toBeHidden();
		await page.keyboard.press('Escape');
		await expect(pal).toBeHidden();

		// slash menu keys footer
		await page.goto(pagePath);
		await page.getByLabel('Page content').click();
		await page.keyboard.type('/');
		await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
		await expect(page.getByText(/Esc cancel/)).toBeHidden();
	});
});

test('C5 fine pointer at 1440x900 keeps every key hint', async ({ page }) => {
	await signIn(page);
	expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);
	const pagePath = await makePage(page, 'Blind desktop page');
	await page.goto('/today');
	const header = page.getByRole('banner');
	const search = header.getByRole('button', { name: /^Search/ });
	const add = header.getByRole('button', { name: /^Add/ });

	// search hint shown and read as today
	await expect(search).toHaveAccessibleName(/^Search .+\+K$/);
	await expect(search.locator('kbd')).toHaveText(/\+(K|k)$/);
	expect(await search.getAttribute('title')).toMatch(/Ctrl\+K|⌘\+K/);

	// Add hint shown and read: "+ Add N"
	await expect(add).toHaveAccessibleName('Add N');
	await expect(add.locator('kbd')).toHaveText('N');

	// the N shortcut still opens QuickAdd, with its footer
	await page.keyboard.press('n');
	const qa = page.getByRole('dialog', { name: 'Quick add' });
	await expect(qa).toBeVisible();
	await expect(qa.getByText('Enter')).toBeVisible();
	await expect(qa.getByText('Esc')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(qa).toBeHidden();

	// palette footer
	await search.click();
	const pal = page.getByRole('dialog', { name: 'Search and go' });
	await expect(pal).toBeVisible();
	await expect(pal.getByText(/Enter open/)).toBeVisible();
	await expect(pal.getByText(/Esc close/)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(pal).toBeHidden();

	// slash menu keys footer
	await page.goto(pagePath);
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
	await expect(page.getByText(/Esc cancel/)).toBeVisible();

	// C8: the Pages Ctrl+K tip is shown for a fine pointer
	await page.goto('/pages');
	await expect(page.getByText(/Tip: Ctrl\+K/)).toBeVisible();
});
