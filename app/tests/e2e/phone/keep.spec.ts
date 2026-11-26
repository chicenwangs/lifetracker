// Keep on phone (#97): swipe a card = archive with Undo, hold = select, hold + drag = reorder; ↑ ↓ only for TalkBack.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, finger, noDesktopHints, signIn, swipe } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let P = '';
const card = (t: string) => page.locator('article.note', { hasText: t });
const order = () => page.locator('article.note h3').allInnerTexts();

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	P = info.project.name;
	// a binder of our own keeps the list short and ours
	const binder = await page.evaluate(async (name) => {
		const r = await fetch('/api/keep/binders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }); // prettier-ignore
		return ((await r.json()) as { binder: { id: string } }).binder.id;
	}, `Gesture ${P}`);
	for (const t of ['K one', 'K two', 'K three'])
		await page.evaluate(
			([title, b]) => fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body: 'x', binders: [b] }) }), // prettier-ignore
			[`${t} ${P}`, binder],
		);
	await page.goto(`/keep?binder=${binder}`);
});
test.afterAll(() => page.context().close());

test('phone: no Select button, no visible ↑ ↓ (still there for TalkBack)', async () => {
	await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeHidden();
	const up = page.getByRole('button', { name: `Move K one ${P} up` });
	await expect(up).toBeAttached();
	expect((await up.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
});

test('swipe a card = archive, Undo brings it back', async () => {
	await swipe(page, card(`K two ${P}`), 'left');
	await expect(page.locator('.toast')).toContainText('Archived');
	await expect(card(`K two ${P}`)).toBeHidden();
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(card(`K two ${P}`)).toBeVisible();
});

test('hold a card = select mode; tap more; Done leaves', async () => {
	const c = card(`K one ${P}`);
	await c.evaluate((n) => n.scrollIntoView({ block: 'center' }));
	const b = (await c.boundingBox())!;
	const f = await finger(page);
	await f.send('touchStart', b.x + b.width / 2, b.y + 20);
	await page.waitForTimeout(600);
	await f.send('touchEnd');
	await f.done();
	const bar = page.getByRole('toolbar', { name: 'Selected notes' });
	await expect(bar).toContainText('1 selected');
	await card(`K three ${P}`)
		.getByRole('button', { name: /^Open note/ })
		.click();
	await expect(bar).toContainText('2 selected');
	await expect(page.getByRole('dialog')).toHaveCount(0); // a tap selects, it doesn't open
	await bar.getByRole('button', { name: 'Done' }).click();
	await expect(bar).toBeHidden();
});

test('hold + drag a card onto another = it moves before it', async () => {
	const before = await order();
	const last = before.at(-1)!;
	const first = before[0]!;
	const a = (await card(last).boundingBox())!;
	const t = (await card(first).boundingBox())!;
	const x = a.x + a.width / 2;
	const y = a.y + 20;
	const f = await finger(page);
	await f.send('touchStart', x, y);
	await page.waitForTimeout(600);
	const tx = t.x + t.width / 2;
	const ty = t.y + 20;
	for (let i = 1; i <= 10; i++) await f.send('touchMove', x + ((tx - x) * i) / 10, y + ((ty - y) * i) / 10);
	await f.send('touchEnd');
	await f.done();
	await expect.poll(async () => (await order())[0]).toBe(last);
});

test('C6 phone Trash: Restore + Delete forever are 48 dp; Restore brings the note back', async () => {
	const title = `C6 restore ${P}`;
	await page.evaluate(async (t) => {
		const r = await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, body: 'x' }) }); // prettier-ignore
		const { note } = (await r.json()) as { note: { id: string } };
		await fetch(`/api/keep/notes/${note.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); // prettier-ignore
	}, title);
	await page.goto('/keep?scope=trash');
	const card = page.locator('article.note', { hasText: title });
	await expect(card).toBeVisible();
	for (const name of ['Restore', 'Delete forever']) {
		const b = card.getByRole('button', { name, exact: true });
		await expect(b).toBeVisible();
		const box = (await b.boundingBox())!;
		expect(Math.round(box.width)).toBeGreaterThanOrEqual(48);
		expect(Math.round(box.height)).toBeGreaterThanOrEqual(48);
	}
	await expectTargets48(page);
	await noDesktopHints(page);
	await card.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(card).toBeHidden();
	await page.goto('/keep');
	await expect(page.locator('article.note', { hasText: title })).toBeVisible();
});
