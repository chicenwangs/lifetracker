// Keep note editor on phone (#107): top bar Back · Pin · bell · ⋮, bottom + · colour; ≤ 5 visible tools;
// every old action still reachable from a sheet; reminder quick picks.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, expectTappable, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let T = '';
const note = () => page.getByRole('dialog', { name: T, exact: true });
const visibleButtons = () =>
	note().evaluate((d) => [...d.querySelectorAll('button, input[type=file], label.file')].filter((b) => (b as HTMLElement).checkVisibility() && b.getBoundingClientRect().width > 1).length); // prettier-ignore

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	T = `Editor ${info.project.name}`;
	await page.evaluate(async (title) => {
		await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body: 'hello' }) }); // prettier-ignore
	}, T);
	await page.goto('/keep');
	await page.locator('article.note', { hasText: T }).getByText(T).click();
	await expect(note()).toBeVisible();
});
test.afterAll(() => page.context().close());

test('bars: Back, Pin, Reminders, Note menu, Add, Colour; nothing else; 48 dp', async () => {
	for (const n of ['Back', 'Pin', 'Reminders', 'Note menu', 'Add to note', 'Colour'])
		await expectTappable(note().getByRole('button', { name: n, exact: true }));
	expect(await visibleButtons()).toBe(6);
	await note().getByRole('textbox').nth(1).focus(); // typing: tools stay the same few
	await expectTargets48(page);
});

test('colour sheet sets the colour; pin toggles', async () => {
	await note().getByRole('button', { name: 'Colour', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Colour' });
	await sheet.getByRole('radio').nth(2).click();
	await expect(sheet).toBeHidden();
	await expect(note()).toHaveClass(/tinted/);
	const pin = note().getByRole('button', { name: 'Pin', exact: true });
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'true');
});

test('+ turns it into a checklist; ⋮ has every old action', async () => {
	await note().getByRole('button', { name: 'Add to note' }).click();
	await page
		.getByRole('dialog', { name: 'Actions for Add' })
		.getByRole('button', { name: 'Checklist' })
		.click();
	await expect(note().getByRole('list', { name: 'Checklist' })).toBeVisible();
	await note().getByRole('button', { name: 'Note menu' }).click();
	const menu = page.getByRole('dialog', { name: `Actions for ${T}` });
	for (const a of ['Labels and binders', 'Share…', 'Duplicate', 'Archive', 'Delete'])
		await expect(menu.getByRole('button', { name: a, exact: true })).toBeVisible();
	await menu.getByRole('button', { name: 'Labels and binders' }).click();
	await expect(
		page.getByRole('dialog', { name: 'Labels and binders' }).getByLabel('New label'),
	).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('dialog', { name: 'Labels and binders' })).toBeHidden();
	await expect(note()).toBeVisible();
});

test('reminder quick pick: Tomorrow morning adds one at 09:00', async () => {
	await note().getByRole('button', { name: 'Reminders' }).click();
	const sheet = page.getByRole('dialog', { name: 'Reminders' });
	await expect(sheet.getByLabel('Exact reminder time')).toHaveCount(0);
	await sheet.getByRole('button', { name: 'Tomorrow morning' }).click();
	await expect(sheet.getByText(/9:00/)).toBeVisible();
	await sheet.getByRole('button', { name: 'Pick date & time' }).click();
	await expect(sheet.getByLabel('Exact reminder time')).toBeVisible();
});

test('Back button closes the note', async () => {
	await page.goBack();
	await note().getByRole('button', { name: 'Back', exact: true }).click();
	await expect(note()).toBeHidden();
});
