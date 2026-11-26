// Phone smoke: each tab loads, shows the bottom bar, every control is 48 dp (#101). Wording: #115 / card 02.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, expectTappable, expectTargets48, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let pagePath = '';
let itemId = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	const made = await page.evaluate(async () => {
		const post = (u: string, b: unknown) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); // prettier-ignore
		const pg = await post('/api/pages', { title: 'Phone smoke page' });
		const qa = await post('/api/quickadd', { text: 'Phone smoke item /calendar' }); // /calendar = item only
		const pageId = ((await pg.json()) as { page: { id: string } }).page.id;
		const item = ((await qa.json()) as { item: { id: string } | null }).item;
		return { pageId, itemId: item?.id ?? '' };
	});
	pagePath = `/pages/${made.pageId}`;
	itemId = made.itemId;
});
test.afterAll(() => page.context().close());

const TABS: [string, () => string][] = [
	['Today', () => '/today'],
	['Week', () => '/week'],
	['Keep', () => '/keep'],
	['More', () => '/more'],
	['a page', () => pagePath],
	['Settings', () => '/settings/preferences'],
	['Month', () => '/month'],
	['Pages', () => '/pages'],
	['Help', () => '/settings/help'],
	['Settings list', () => '/settings'],
];

test('Add sheet: every / command in quick add can be tapped', async () => {
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	await page.keyboard.type('gym tmr 6pm /');
	await expectTappable(page.getByRole('dialog', { name: 'Add' }).getByRole('option'));
	await page.keyboard.press('Escape');
});

for (const [name, path] of TABS) {
	test(`${name} loads and shows the bottom bar`, async () => {
		const res = await page.goto(path());
		expect(res?.status()).toBeLessThan(400);
		await expect(page).not.toHaveURL(/\/login/);
		await expect(bottomBar(page)).toBeVisible();
	});
	test(`${name}: every control is 48×48 (#101)`, async () => {
		await page.goto(path());
		await expectTargets48(page);
	});
	test(`${name}: no desktop wording (#115)`, async () => {
		await page.goto(path());
		await noDesktopHints(page);
	});
}

// Card 02: the full C1 sweep — every phone surface, including the item page and every Settings screen.
const SWEEP = [
	'/',
	'/today',
	'/week',
	'/month',
	'/keep',
	'/keep?scope=trash',
	'/pages',
	'/more',
	'/settings',
	'/settings/account',
	'/settings/preferences',
	'/settings/notifications',
	'/settings/sharing',
	'/settings/sessions',
	'/settings/users',
	'/settings/types',
	'/settings/import',
	'/settings/help',
];

test('C1 every phone surface: no desktop wording and every control is 48 dp', async () => {
	for (const path of [...SWEEP, pagePath, `/item/${itemId}`]) {
		await page.goto(path);
		await expect(page).not.toHaveURL(/\/login/);
		await noDesktopHints(page);
		try {
			await expectTargets48(page);
		} catch (e) {
			throw new Error(`${path}: ${(e as Error).message}`, { cause: e });
		}
	}
});

test('C2 the Add sheet: no desktop wording', async () => {
	await page.goto('/today');
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	await expect(page.getByRole('dialog', { name: 'Add' })).toBeVisible();
	await noDesktopHints(page);
	await expectTargets48(page);
});

test('C2 the item sheet: no desktop wording', async () => {
	await page.goto('/today');
	await page
		.getByRole('banner')
		.getByRole('button', { name: /^Search/ })
		.click();
	await page.getByRole('combobox', { name: 'Search' }).fill('Phone smoke item');
	await page.getByRole('dialog', { name: 'Search and go' }).getByRole('option').first().click();
	await expect(page.getByRole('dialog', { name: 'Item' })).toBeVisible();
	await noDesktopHints(page);
	await expectTargets48(page);
});

test('C2 the page ⋯ menu: no desktop wording', async () => {
	await page.goto(pagePath);
	await page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeVisible();
	await noDesktopHints(page);
	await expectTargets48(page);
	await page.goBack(); // Back closes the menu first (#91)
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeHidden();
});

test('C2 the "/" slash menu: no desktop wording', async () => {
	await page.goto(pagePath);
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
	await noDesktopHints(page);
	await expectTargets48(page);
	await page.keyboard.press('Escape');
});

test('C2 the search palette: no desktop wording', async () => {
	await page.goto('/today');
	await page
		.getByRole('banner')
		.getByRole('button', { name: /^Search/ })
		.click();
	await page.getByRole('combobox', { name: 'Search' }).fill('Phone smoke');
	await expect(page.getByRole('dialog', { name: 'Search and go' }).getByRole('option').first()).toBeVisible();
	await noDesktopHints(page);
	await expectTargets48(page);
});

test('C3 double-click / right-click wording is caught, in text and in a title', async () => {
	await page.goto('/today');
	await page.evaluate(() => {
		const p = document.createElement('p');
		p.textContent = 'double-click to open, right-click for more';
		const t = document.createElement('button');
		t.setAttribute('title', 'right-click me');
		document.body.append(p, t);
	});
	let failed = false;
	try {
		await noDesktopHints(page);
	} catch {
		failed = true;
	}
	expect(failed, 'the widened noDesktopHints must fail on the probe text').toBe(true);
});
