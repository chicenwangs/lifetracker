// Pull to refresh (#103): on a tab at the top, pull down past the line = fresh data; a short pull does nothing.
// Tap path: re-tap the open tab at the top. TalkBack: a Refresh button.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, finger, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let tag: string;
const addNote = (title: string) =>
	page.evaluate(async (t) => {
		await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, body: 'x' }) }); // prettier-ignore
	}, title);
async function pull(dy: number) {
	const x = page.viewportSize()!.width / 2;
	const f = await finger(page);
	await f.send('touchStart', x, 120);
	for (let i = 1; i <= 10; i++) await f.send('touchMove', x, 120 + (dy * i) / 10);
	await f.send('touchEnd');
	await f.done();
}

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	tag = info.project.name;
	await page.goto('/keep');
});
test.afterAll(() => page.context().close());

test('browser pull-to-reload is off', async () => {
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)).toBe(
		'contain',
	);
});

test('short pull: nothing; long pull: new data', async () => {
	await addNote(`Pulled in ${tag}`);
	await pull(60);
	await page.waitForTimeout(500);
	await expect(page.getByText(`Pulled in ${tag}`)).toHaveCount(0);
	await pull(260);
	await expect(page.getByText(`Pulled in ${tag}`).first()).toBeVisible();
});

test('tap path: re-tap the open tab at the top; Refresh button for TalkBack', async () => {
	await addNote(`Tapped in ${tag}`);
	await bottomBar(page).getByRole('link', { name: 'Keep' }).click();
	await expect(page.getByText(`Tapped in ${tag}`).first()).toBeVisible();
	await addNote(`Read out in ${tag}`);
	await page.getByRole('button', { name: 'Refresh', exact: true }).dispatchEvent('click'); // sr-only: how TalkBack activates it
	await expect(page.getByText(`Read out in ${tag}`).first()).toBeVisible();
});
