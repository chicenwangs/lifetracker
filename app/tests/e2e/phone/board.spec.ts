// v4 PR 23: phone board = chips row + one column at a time; long press picks a card up, tapping a column chip
// moves it; the card ... menu works too; every move has Undo.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

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

test('board: chips, long-press move + Undo, card menu move', async () => {
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
	await page.goto(`/pages/${db.pageId}`);
	await page.getByRole('tab', { name: /Board/ }).click();
	const chips = page.getByRole('tablist', { name: 'Board columns' });
	const shown = () => page.locator('section.bcol.on');
	await expect(chips.getByRole('tab', { name: /Todo/ })).toBeVisible();
	await expect(shown()).toContainText('Alpha');

	// long press = pick up; the next column chip drops it there
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

	// the card ... menu works on the phone too (the reliable path)
	await shown().getByRole('button', { name: 'Actions for Alpha' }).click();
	await page.getByRole('menuitem', { name: 'Move to Doing' }).click();
	await expect(page.locator('.toast')).toContainText('Moved to Doing');
	await chips.getByRole('tab', { name: /Doing/ }).click();
	await expect(shown()).toContainText('Alpha');
});
