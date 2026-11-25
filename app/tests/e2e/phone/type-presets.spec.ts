// v3.3 PR 14 (phone): the starter pack menu is 48 dp, adds Class (Month calendar off) and Undo removes it.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, signIn } from './helpers';

const rowFor = (page: Page, name: string) =>
	page
		.locator('tbody tr')
		.filter({ has: page.getByRole('checkbox', { name: `Show ${name} on the Month calendar` }) });

test.describe.configure({ mode: 'serial' });
let page: Page;
test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(async () => {
	await page
		.evaluate(async () => {
			const j = (await (await fetch('/api/item-types')).json()) as { types: { id: string; name: string }[] };
			for (const t of j.types) if (t.name === 'Class') await fetch('/api/item-types/' + t.id, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{"moveTo":null}' }); // prettier-ignore
		})
		.catch(() => {});
	await page.context().close();
});

test('add Class from the preset menu, 48 dp, Undo', async () => {
	await page.goto('/settings/types');
	await expect(rowFor(page, 'Class')).toHaveCount(0);
	await page.locator('summary', { hasText: 'Add a preset' }).click();
	await expectTargets48(page);
	await page.getByRole('button', { name: 'Class', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('Added type "Class"');
	const row = rowFor(page, 'Class');
	await expect(row).toBeVisible();
	await expect(row.getByRole('checkbox', { name: 'Show Class on the Month calendar' })).not.toBeChecked();
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(rowFor(page, 'Class')).toHaveCount(0);
});
