// Pages on phone (#98): toolbar docks to the bottom only while typing, 48 dp, no Ctrl hints; block actions in a
// sheet; Pin + Share in the ⋯ menu.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, expectTappable, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const tools = () => page.getByRole('toolbar', { name: 'Formatting and block tools' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t }) }); // prettier-ignore
		return ((await r.json()) as { page: { id: string } }).page.id;
	}, `Phone editor ${info.project.name}`);
	await page.goto(`/pages/${id}`);
});
test.afterAll(() => page.context().close());

test('toolbar hidden until typing, then docked above the tab bar, 48 dp, no Ctrl', async () => {
	await expect(tools()).toBeHidden();
	await page.getByLabel('Page content').click();
	await expect(tools()).toBeVisible();
	const box = await tools().boundingBox();
	const barTop = Math.round((await page.locator('nav.mbar').boundingBox())!.y);
	// #433: the toolbar sits on top of the tab bar (its bottom edge meets the bar's top edge)
	expect(Math.round(box!.y + box!.height)).toBeLessThanOrEqual(barTop);
	expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(barTop - 2);
	await expectTargets48(page);
	await noDesktopHints(page);
	await expect(tools().locator('[title*="Ctrl"]')).toHaveCount(0);
	// a toolbar tap keeps the text focused (toolbar stays)
	await tools().getByRole('button', { name: 'Bold' }).click();
	await expect(tools().getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
	await expect(tools()).toBeVisible();
	await page.getByLabel('Page title').click();
	await expect(tools()).toBeHidden();
});

test('the docked toolbar leaves every tab tappable (#433)', async () => {
	await page.getByLabel('Page content').click();
	await expect(tools()).toBeVisible();
	const hits = await page.evaluate(() => {
		const bar = document.querySelector('nav.mbar')!;
		return [...bar.querySelectorAll<HTMLElement>('a, button')].map((a) => {
			const r = a.getBoundingClientRect();
			const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
			return {
				label: (a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 16),
				hit: at ? (at.closest('nav.mbar') ? 'bar' : (at as HTMLElement).tagName) : 'none',
			};
		});
	});
	expect(hits.length).toBeGreaterThan(0);
	for (const h of hits) expect(`${h.label}:${h.hit}`).toBe(`${h.label}:bar`);
	const tb = (await tools().boundingBox())!;
	const bb = (await page.locator('nav.mbar').boundingBox())!;
	expect(Math.round(tb.y + tb.height)).toBeLessThanOrEqual(Math.round(bb.y));
	await page.getByLabel('Page title').click();
});

test('"/" menu and page ⋯ menu rows are 48 dp (#228, #223)', async () => {
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
	await expectTargets48(page);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Backspace');
	await page.getByLabel('Page title').click();
	await page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeVisible();
	await expectTargets48(page);
	await page.goBack(); // Back closes the menu (#91)
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeHidden();
});

test('block ⋯ = sheet with move, duplicate, delete', async () => {
	await page.getByLabel('Page content').click();
	await page.keyboard.type('first line');
	await tools().getByRole('button', { name: 'Block actions' }).click();
	const sheet = page.getByRole('dialog', { name: 'Actions for Block' });
	await expectTappable(sheet.getByRole('button', { name: 'Duplicate' }));
	await sheet.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.getByLabel('Page content').getByText('first line')).toHaveCount(2);
});

test('Pin and Share live in the ⋯ menu', async () => {
	await page.getByLabel('Page title').click();
	const bar = page.locator('.pagev .bar');
	await expect(bar.getByRole('button', { name: 'Share', exact: true })).toBeHidden();
	await expect(bar.getByRole('button', { name: 'Pin', exact: true })).toBeHidden();
	await bar.getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Pin to header' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Share…' }).click();
	await expect(page.getByRole('dialog', { name: /Share/ })).toBeVisible();
});

test('Pin toast says Pinned, Unpin toast says Unpinned (#348)', async () => {
	await page.getByRole('dialog', { name: /Share/ }).getByRole('button', { name: 'Done' }).click();
	const bar = page.locator('.pagev .bar');
	await bar.getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: 'Pin to header' }).click();
	await expect(page.getByText('Pinned to header')).toBeVisible();
	await bar.getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: /^Unpin/ }).click();
	await expect(page.getByText('Unpinned from header')).toBeVisible();
});

test('page icon sheet: 48 dp grid, Close hides, Remove clears', async () => {
	// phone: the header has no "Add icon" row; the page ⋯ sheet opens the picker (DESIGN 2.1)
	await page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: 'Add icon' }).click();
	await page.waitForTimeout(250); // the menu's history entry is swapped for the sheet's (layers.ts)
	const sheet = page.getByRole('dialog', { name: 'Page icon' });
	await expect(sheet).toBeVisible();
	await expectTargets48(page);
	await sheet.getByRole('option', { name: '⭐' }).click();
	await expect(page.getByRole('button', { name: 'Page icon: ⭐' })).toHaveText('⭐');
	await page.getByRole('button', { name: 'Page icon: ⭐' }).click();
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Close' }).click(); // BottomSheet's own close (Back is covered by #91)
	await expect(sheet).toBeHidden();
	await page.getByRole('button', { name: 'Page icon: ⭐' }).click();
	await sheet.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('button', { name: 'Page icon: ⭐' })).toHaveCount(0);
	// empty again: no header row on phone, the ⋯ sheet offers Add icon again
	await page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Add icon' })).toBeVisible();
});

test('Archive: 48 dp search field and no sideways scroll at 320 px (#405)', async () => {
	await page.goto('/pages/archive');
	await expect(page.getByLabel('Search archive')).toBeVisible();
	await expectTargets48(page); // the field was 32 px tall before
	const vp = page.viewportSize()!;
	try {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.waitForTimeout(200);
		const m = await page.evaluate(() => {
			const d = document.documentElement;
			const sort = document.querySelector('select')!.getBoundingClientRect();
			return { scrollW: d.scrollWidth, clientW: d.clientWidth, sortRight: Math.round(sort.right) };
		});
		expect(m.scrollW).toBeLessThanOrEqual(m.clientW); // 401 px wide before
		expect(m.sortRight).toBeLessThanOrEqual(320); // Sort was clipped
	} finally {
		await page.setViewportSize(vp);
	}
});

test('duplicate from the page menu: the copy opens (#440)', async () => {
	const T = 'Phone dup source';
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t }) }); // prettier-ignore
		return ((await r.json()) as { page: { id: string } }).page.id;
	}, T);
	await page.goto(`/pages/${id}`);
	await page.locator('.pagev .bar').getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect.poll(() => page.url()).not.toContain(`/pages/${id}`);
	const copyId = page.url().split('/').pop() as string;
	await expect(page.getByLabel('Page title')).toHaveValue(`Copy of ${T}`);
	await page.evaluate(
		async (ids) => {
			for (const x of ids) await fetch(`/api/pages/${x}`, { method: 'DELETE' });
		},
		[id, copyId] as string[],
	);
});

test('to-do reminder from the block sheet (#453)', async () => {
	const BID = 'pbl_00000000000000bb';
	const doc = {
		type: 'doc',
		content: [
			{
				type: 'taskList',
				content: [
					{
						type: 'taskItem',
						attrs: { checked: false, blockId: BID },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Water plants' }] }],
					},
				],
			},
		],
	};
	const id = await page.evaluate(async (d) => {
		const r = await fetch('/api/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Phone to-do reminder' }) }); // prettier-ignore
		const p = (await r.json()) as { page: { id: string } };
		await fetch(`/api/pages/${p.page.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: d }) }); // prettier-ignore
		return p.page.id;
	}, doc);
	await page.goto(`/pages/${id}`);
	await page.getByText('Water plants', { exact: true }).click();
	await tools().getByRole('button', { name: 'Block actions' }).click();
	await page.getByRole('button', { name: 'Remind me' }).click();
	const dialog = page.getByRole('dialog', { name: 'Reminder' });
	await expect(dialog).toBeVisible();
	const d = new Date(Date.now() + 3 * 86_400_000);
	const when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00`;
	await dialog.getByLabel('Exact reminder time').fill(when);
	await dialog.getByRole('button', { name: 'Add at time' }).click();
	await expect(dialog.getByRole('button', { name: /Remove reminder/ })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close' }).click();
	await expect(page.locator('.todo-rem')).toBeVisible();
	await expect(page.locator('.todo-rem')).toContainText(/\d{1,2}:\d{2}/);
	await page.evaluate(async (x) => fetch(`/api/pages/${x}`, { method: 'DELETE' }), id);
});
