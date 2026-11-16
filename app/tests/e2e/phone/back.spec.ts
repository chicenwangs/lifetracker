// Back closes the top layer first (#91): search, menus, Keep note, page menu. Closing in the UI leaves no dead Back.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const path = () => new URL(page.url()).pathname;

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

const post = (url: string, body: unknown) =>
	page.evaluate(
		async ([u, b]) =>
			(await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json(), // prettier-ignore
		[url, body],
	);

test('Back closes search and stays on the page', async () => {
	await page.goto('/week');
	await page.goto('/today');
	await page.locator('[aria-label^="Search"]').first().click();
	const dlg = page.getByRole('dialog', { name: 'Search and go' });
	await expect(dlg).toBeVisible();
	await page.goBack();
	await expect(dlg).toBeHidden();
	expect(path()).toBe('/today');
	await page.goBack();
	expect(path()).toBe('/week');
});

test('closing in the UI uses up the entry: next Back leaves the page', async () => {
	await page.goto('/week');
	await page.goto('/today');
	await page.locator('[aria-label^="Search"]').first().click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Search and go' })).toBeHidden();
	await expect.poll(() => page.evaluate(() => history.state?.['sveltekit:states']?.layer)).toBeUndefined();
	await page.goBack();
	expect(path()).toBe('/week');
});

test('Back closes the account menu; a link in it navigates once', async () => {
	await page.goto('/today');
	const menuBtn = page.getByRole('button', { name: 'Account menu' });
	await menuBtn.click();
	const prefs = page.getByRole('link', { name: 'Preferences' });
	await expect(prefs).toBeVisible();
	await page.goBack();
	await expect(prefs).toBeHidden();
	expect(path()).toBe('/today');

	await menuBtn.click();
	await prefs.click();
	await expect(page).toHaveURL(/\/settings\/preferences$/);
	await page.waitForTimeout(300); // a wrong history.back() would land here
	expect(path()).toBe('/settings/preferences');
	await page.goBack();
	expect(path()).toBe('/today');
	await expect(prefs).toBeHidden();
});

test('Back closes an open Keep note', async () => {
	await post('/api/keep/notes', { title: 'Back test note', body: 'hello' });
	await page.goto('/keep');
	await page.getByText('Back test note').first().click();
	const note = page.getByRole('dialog');
	await expect(note).toBeVisible();
	await page.goBack();
	await expect(note).toBeHidden();
	expect(path()).toBe('/keep');
});

test('Back closes the page menu', async () => {
	const r = (await post('/api/pages', { title: 'Back test page' })) as { page: { id: string } };
	await page.goto(`/pages/${r.page.id}`);
	await page.getByRole('button', { name: 'Page menu' }).click();
	const menu = page.getByRole('menu');
	await expect(menu).toBeVisible();
	await page.goBack();
	await expect(menu).toBeHidden();
	expect(path()).toBe(`/pages/${r.page.id}`);
});
