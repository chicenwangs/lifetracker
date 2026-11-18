// First-use gesture hints (#104): one card per gesture screen on phone; "Got it" = never again (saved for the
// user, survives a reload and a new device session).
import { expect, test, type Page } from '@playwright/test';
import { HINTS, expectTappable, setHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const card = () => page.getByRole('note').filter({ hasText: 'Swipe' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	await setHints(page, []);
});
test.afterAll(async () => {
	await setHints(page, HINTS); // the other phone specs run without hints
	await page.context().close();
});

for (const [path, words] of [
	['/today', 'other days'],
	['/week', 'week before or after'],
	['/month', 'month sideways'],
	['/keep', 'archive it'],
] as const)
	test(`${path}: hint once, Got it = gone for good`, async () => {
		await page.goto(path);
		await expect(card()).toContainText(words);
		await expect(card()).toBeInViewport(); // on screen when the page opens, not below the list (#224)
		await expectTappable(card().getByRole('button', { name: 'Got it' }));
		await card().getByRole('button', { name: 'Got it' }).click();
		await expect(card()).toHaveCount(0);
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(card()).toHaveCount(0);
	});

test('all four remembered for the user', async () => {
	const seen = await page.evaluate(async () => {
		const r = await fetch('/api/me/prefs', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }); // prettier-ignore
		return ((await r.json()) as { user: { hintsSeen: string[] } }).user.hintsSeen;
	});
	expect([...(seen ?? [])].sort()).toEqual([...HINTS].sort());
});
