// v4 PR 23: phone board = chips row + one column at a time; swipe between columns; long press picks a card up
// and the next chip drops it; the card ... menu works too and Back closes it; + View / View settings are sheets.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, finger, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const api = (m: string, p: string, b?: unknown) =>
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

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('board: chips, swipe, long-press move + Undo, card tap, menu Back, sheets, 48 dp', async () => {
	const db = (await api('POST', '/api/databases', { title: 'Phone board' })).j.database as {
		id: string;
		pageId: string;
	};
	const st = (
		await api('POST', `/api/databases/${db.id}/properties`, {
			name: 'Status',
			type: 'select',
			config: {
				options: [
					{ id: 'todo', label: 'Todo', color: 'work' },
					{ id: 'doing', label: 'Doing', color: 'hobby' },
				],
			},
		})
	).j.prop as { id: string };
	const info = (await api('GET', `/api/databases/${db.id}`)).j.database as {
		props: { id: string; type: string }[];
	};
	const tp = info.props.find((p) => p.type === 'title')!;
	await api('POST', `/api/databases/${db.id}/records`, { values: { [tp.id]: 'Alpha', [st.id]: 'todo' } });
	await api('POST', `/api/databases/${db.id}/views`, { name: 'Board', type: 'board' });
	const openBoard = async () => {
		await page.goto(`/pages/${db.pageId}`);
		await page.getByRole('tab', { name: /Board/ }).click();
		await expect(page.getByRole('tablist', { name: 'Board columns' })).toBeVisible();
	};
	await openBoard();
	const chips = page.getByRole('tablist', { name: 'Board columns' });
	const shown = () => page.locator('section.bcol.on');
	await expect(chips.getByRole('tab', { name: /Todo/ })).toBeVisible();
	await expect(shown()).toContainText('Alpha');
	await expectTargets48(page);

	// long press = pick up; the next column chip drops it there, Undo puts it back
	const card = shown().locator('.bcard', { hasText: 'Alpha' });
	await card.scrollIntoViewIfNeeded(); // landscape: the column sits below the fold
	const b = (await card.boundingBox())!;
	await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6);
	await page.mouse.down();
	await page.waitForTimeout(650);
	await page.mouse.up();
	await expect(page.getByText('Tap a column above to move the card.')).toBeVisible();
	await chips.getByRole('tab', { name: /Doing/ }).click();
	await expect(shown()).toContainText('Alpha'); // Doing is the shown column now
	await expect(page.locator('.toast')).toContainText('Moved to Doing');
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await chips.getByRole('tab', { name: /Todo/ }).click();
	await expect(shown()).toContainText('Alpha');

	// one tap on the title after a pick-up move still opens the record (no swallowed click left over)
	await shown().getByRole('button', { name: 'Alpha', exact: true }).click();
	await expect(page).toHaveURL(/\/pages\/pg_/);
	await openBoard();

	// swipe left / right between the columns (peers), the chips follow
	const board = page.locator('.board');
	await board.scrollIntoViewIfNeeded();
	const bb = (await board.boundingBox())!;
	const y = bb.y + Math.min(40, bb.height / 2);
	const swipe = async (fromX: number, toX: number) => {
		const f = await finger(page);
		await f.send('touchStart', fromX, y);
		for (const t of [0.25, 0.5, 0.75, 1]) await f.send('touchMove', fromX + (toX - fromX) * t, y);
		await f.send('touchEnd');
		await f.done();
		await page.waitForTimeout(500);
	};
	await swipe(bb.x + bb.width - 30, bb.x + 40);
	await expect(chips.getByRole('tab', { name: /Doing/ })).toHaveAttribute('aria-selected', 'true');
	await swipe(bb.x + 40, bb.x + bb.width - 30);
	await expect(chips.getByRole('tab', { name: /Todo/ })).toHaveAttribute('aria-selected', 'true');

	// the card ... menu: 48 dp items, and Back closes it without leaving the page
	const before = page.url();
	await shown().getByRole('button', { name: 'Actions for Alpha' }).click();
	const menu = page.getByRole('menu', { name: 'Actions for Alpha' });
	await expect(menu).toBeVisible();
	await expectTargets48(page);
	await page.goBack();
	await expect(menu).toHaveCount(0);
	expect(page.url()).toBe(before);

	// the menu move path + Undo
	await shown().getByRole('button', { name: 'Actions for Alpha' }).click();
	await page.getByRole('menuitem', { name: 'Move to Doing' }).click();
	await expect(page.locator('.toast')).toContainText('Moved to Doing');
	await chips.getByRole('tab', { name: /Doing/ }).click();
	await expect(shown()).toContainText('Alpha');

	// View settings and + View open sheets on the phone; Back closes them
	await page.getByRole('button', { name: 'View settings' }).click();
	const settings = page.getByRole('dialog', { name: 'View settings' });
	await expect(settings).toBeVisible();
	await expect(settings.getByLabel('Group by')).toBeVisible();
	await page.goBack();
	await expect(settings).toBeHidden();
	await page.getByRole('button', { name: '+ View' }).click();
	const nv = page.getByRole('dialog', { name: 'New view' });
	await expect(nv).toBeVisible();
	await page.goBack();
	await expect(nv).toBeHidden();
});
