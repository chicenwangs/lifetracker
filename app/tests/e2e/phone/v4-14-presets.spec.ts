// Card 14 (O-1 item 6, D-V4-11, D-V4-21) on phone: the "+ Add a preset ▾" button and every preset row are 48 dp,
// the menu is the shared BottomSheet reached by tap, no key-hint copy, and Back closes the sheet before the page.
// Tapping a preset adds it once with no undo toast, and the new type fills the Add sheet's Type chip.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { bottomBar, expectTargets48, noDesktopHints, signIn } from './helpers';

const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: await r.json().catch(() => null) };
		},
		[m, p, b] as const,
	);
interface TypeRow {
	id: string;
	key: string;
	name: string;
	slug: string;
	builtin: boolean;
	onCalendar: boolean;
}
const types = async (page: Page) =>
	((await api(page, 'GET', '/api/item-types')).j as { types: TypeRow[] }).types;

/** the shared e2e DB keeps what earlier specs wrote: start from the five built-ins, Month on, nothing hidden */
async function reset(page: Page) {
	for (const t of (await types(page)).filter((t) => !t.builtin)) {
		const r = await api(page, 'DELETE', `/api/item-types/${t.id}`, { moveTo: null });
		expect(r.s).toBe(200);
	}
	for (const t of await types(page))
		if (!t.onCalendar) await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: true });
	await api(page, 'PATCH', '/api/me/prefs', { hiddenTypes: [] });
}

const size = (el: Locator) =>
	el.evaluate((n) => {
		const r = n.getBoundingClientRect();
		return { w: r.width, h: r.height };
	});
const presetBtn = (page: Page) => page.getByRole('button', { name: /Add a preset/ });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add a preset' });

test('C10 phones get a 48 dp preset button and 48 dp sheet rows, tap opens them, no key hints, Back closes it', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	await page.goto('/settings');
	await page
		.getByRole('main')
		.getByRole('link', { name: /^Item types/ })
		.click();
	await expect(page).toHaveURL(/\/settings\/types$/);

	const add = presetBtn(page);
	await expect(add).toBeVisible();
	const btnBox = await size(add);
	expect(Math.round(btnBox.w)).toBeGreaterThanOrEqual(48);
	expect(Math.round(btnBox.h)).toBeGreaterThanOrEqual(48);
	// tap (no hover): the shared sheet lists the five presets in order, each a 48 dp row
	await add.click();
	await expect(sheet(page)).toBeVisible();
	const rows = sheet(page).locator('.preset');
	await expect(rows).toHaveCount(5);
	expect(await rows.allInnerTexts()).toEqual(['Class', 'Errand', 'Health', 'Chore', 'Study']);
	for (const n of await rows.all()) {
		const box = await size(n);
		expect(Math.round(box.w)).toBeGreaterThanOrEqual(48);
		expect(Math.round(box.h)).toBeGreaterThanOrEqual(48);
	}
	await expectTargets48(page);
	await noDesktopHints(page);

	// Back closes the open sheet and leaves Settings where it was
	await page.goBack();
	await expect(sheet(page)).toHaveCount(0);
	await expect(page).toHaveURL(/\/settings\/types$/);
	await expect(page.getByLabel('Name of Work')).toBeVisible();
});

test('C4/C6/C11 a tap adds Class once with no undo toast; /class fills the Add sheet chip; then it is (have it)', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	await page.goto('/settings/types');
	await presetBtn(page).click();
	await sheet(page).locator('.preset', { hasText: 'Class' }).click();
	await expect(page.getByLabel('Name of Class')).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0); // no undo toast for type settings (D-V4-11)
	const cls = (await types(page)).filter((t) => t.slug === 'class');
	expect(cls).toHaveLength(1);
	expect((cls[0] as TypeRow).onCalendar).toBe(false);

	// C6: /class in the phone Add sheet fills the Type chip with the new type's name
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	const addSheet = page.getByRole('dialog', { name: 'Add' });
	await page.keyboard.type('revision /class');
	await expect(addSheet.locator('#qa-slots, .slots').first()).toContainText('Class');
	await page.goBack(); // the "/" menu is its own layer (#282)
	await page.goBack();
	await expect(addSheet).toHaveCount(0);

	// C3/C8: reopening shows Class greyed with "(have it)"; nothing is duplicated
	await page.goto('/settings/types');
	await presetBtn(page).click();
	const taken = sheet(page).locator('.preset', { hasText: 'Class' });
	await expect(taken).toBeDisabled();
	await expect(taken).toContainText('(have it)');
	await page.goBack();
	expect((await types(page)).filter((t) => t.slug === 'class')).toHaveLength(1);
	await reset(page);
});
