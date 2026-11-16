// Search on phone (#99): full screen, no desktop actions or key hints, Planner · Keep · Pages, big rows,
// opened results come back first; Back / the ‹ button close it.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let word: string;
const dlg = () => page.getByRole('dialog', { name: 'Search and go' });
const open = async () => {
	await page
		.getByRole('banner')
		.getByRole('button', { name: /^Search/ })
		.click();
	await expect(dlg()).toBeVisible();
};

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	word = `Zebra${info.project.name.replace(/\W/g, '')}`;
	await page.evaluate(async (w) => {
		const post = (u: string, b: unknown) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); // prettier-ignore
		await post('/api/pages', { title: `${w} page` });
		await post('/api/items', { title: `${w} task`, date: '2030-03-04' });
	}, word);
	await page.goto('/today');
});
test.afterAll(() => page.context().close());

test('full screen, 48 dp, no desktop actions or hints', async () => {
	await open();
	const box = await dlg().boundingBox();
	const vp = page.viewportSize()!;
	expect(box).toMatchObject({ x: 0, y: 0, width: vp.width, height: vp.height });
	await expect(dlg().getByText('Go to Home')).toHaveCount(0);
	await expect(dlg().getByText('Quick add')).toHaveCount(0);
	await noDesktopHints(page);
	await expectTargets48(page);
	await dlg().getByRole('button', { name: 'Close search' }).click();
	await expect(dlg()).toBeHidden();
});

test('results grouped Planner first, opened one shows as Recent; Back closes', async () => {
	await open();
	await page.getByRole('combobox', { name: 'Search' }).fill(word);
	const opts = dlg().getByRole('option');
	await expect(opts.first()).toContainText(`${word} task`);
	await expect(dlg().getByText(`${word} page`)).toBeVisible();
	const row = await dlg()
		.getByRole('option', { name: new RegExp(`${word} page`) })
		.boundingBox();
	expect(row!.height).toBeGreaterThanOrEqual(56);
	await dlg()
		.getByRole('option', { name: new RegExp(`${word} page`) })
		.click();
	await expect(page).toHaveURL(/\/pages\/pg_/);
	await open();
	await expect(dlg().getByText('Recent')).toBeVisible();
	await expect(dlg().getByRole('option').first()).toContainText(`${word} page`);
	await page.goBack();
	await expect(dlg()).toBeHidden();
	await expect(page).toHaveURL(/\/pages\/pg_/);
});
