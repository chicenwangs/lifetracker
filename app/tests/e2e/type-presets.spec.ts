// v3.3 PR 14: the type starter pack — add Class (Month calendar off), "(have it)" on the second look, Undo removes it.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './signin';

const rowFor = (page: Page, name: string) =>
	page
		.locator('tbody tr')
		.filter({ has: page.getByRole('checkbox', { name: `Show ${name} on the Month calendar` }) });

test('starter pack: add Class, have-it, Undo', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/types');
	await expect(rowFor(page, 'Class')).toHaveCount(0);
	await page.locator('summary', { hasText: 'Add a preset' }).click();
	await page.getByRole('button', { name: 'Class', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('Added type "Class"');
	// Class is a normal row, with the Month calendar switch off (its whole point for a timetable)
	const row = rowFor(page, 'Class');
	await expect(row).toBeVisible();
	await expect(row.getByRole('checkbox', { name: 'Show Class on the Month calendar' })).not.toBeChecked();
	// the preset list now greys it
	await page.locator('summary', { hasText: 'Add a preset' }).click();
	await expect(page.getByRole('button', { name: /Class.*have it/ })).toBeDisabled();
	// Undo removes the new type again
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(rowFor(page, 'Class')).toHaveCount(0);
});
