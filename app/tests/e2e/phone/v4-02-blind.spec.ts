// Blind tests for card 02 (phone / Android desktop-word hints). Written from the card's Done-when lines
// only: C1, C2, C3, C6, C7, C8. Runs in the `phone` (412x915) and `phone-landscape` (915x412) projects.
import { expect, test, type Page } from '@playwright/test';
import { bottomBar, expectTargets48, noDesktopHints, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let pagePath = '';
let itemId = '';
let itemPath = '';
const ROUTES: [string, string][] = [];
const LAYERS: [string, () => Promise<void>][] = [];

// the helper rule widened by C3: double-click / right-click count as desktop wording too
const WIDE = String.raw`\b(ctrl|click|esc)\b|double-click|right-click|pc view`;

/** every visible text node and every visible aria-label / aria-description / title that matches WIDE */
async function widenedHits(): Promise<string[]> {
	await page.waitForLoadState('networkidle'); // hydrated: phone-only wording is set after mount
	return page.evaluate((src) => {
		const re = new RegExp(src, 'i');
		const out: string[] = [];
		const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			const t = n.textContent ?? '';
			if (re.test(t) && n.parentElement?.checkVisibility({ checkVisibilityCSS: true }))
				out.push(`text "${t.trim().slice(0, 60)}"`);
		}
		for (const el of document.querySelectorAll<HTMLElement>('[aria-label], [aria-description], [title]')) {
			if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
			for (const at of ['aria-label', 'aria-description', 'title']) {
				const t = el.getAttribute(at) ?? '';
				if (re.test(t)) out.push(`[${at}] "${t.slice(0, 60)}"`);
			}
		}
		return out;
	}, WIDE);
}

/** open a screen; the page route is opened with the editor focused (its toolbar is part of the screen) */
async function visit(path: string) {
	const res = await page.goto(path);
	expect(res?.status() ?? 0).toBeLessThan(400);
	if (path === pagePath) {
		await page.getByLabel('Page content').click();
		await expect(page.getByRole('toolbar', { name: 'Formatting and block tools' })).toBeVisible();
	}
}

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	const tag = info.project.name;
	const made = await page.evaluate(async (name) => {
		const post = async (url: string, body: unknown) => {
			const r = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!r.ok) throw new Error(`${url} ${r.status}: ${await r.text()}`);
			return r.json();
		};
		const pg = (await post('/api/pages', { title: `Blind hint page ${name}` })) as {
			page: { id: string };
		};
		const qa = (await post('/api/quickadd', { text: `Blind hint item ${name} tmr 10am /calendar` })) as {
			item: { id: string };
		};
		return { pageId: pg.page.id, itemId: qa.item.id };
	}, tag);
	pagePath = `/pages/${made.pageId}`;
	itemId = made.itemId;
	itemPath = `/item/${itemId}`;

	ROUTES.push(
		['Home', '/'],
		['Today', '/today'],
		['Week', '/week'],
		['Month', '/month'],
		['Keep', '/keep'],
		['Keep trash', '/keep?scope=trash'],
		['Pages', '/pages'],
		['a page, editor open', pagePath],
		['an item', itemPath],
		['More', '/more'],
		['Settings account', '/settings/account'],
		['Settings preferences', '/settings/preferences'],
		['Settings notifications', '/settings/notifications'],
		['Settings sharing', '/settings/sharing'],
		['Settings sessions', '/settings/sessions'],
		['Settings users', '/settings/users'],
		['Settings types', '/settings/types'],
		['Settings import', '/settings/import'],
		['Settings help', '/settings/help'],
	);

	LAYERS.push(
		[
			'Add sheet',
			async () => {
				await page.goto('/today');
				await bottomBar(page).getByRole('button', { name: 'Add' }).click();
				await expect(page.getByRole('dialog', { name: 'Add' })).toBeVisible();
			},
		],
		[
			'item sheet',
			async () => {
				await page.goto(`/today?item=${itemId}`);
				await expect(page.getByRole('dialog', { name: 'Item' })).toBeVisible();
			},
		],
		[
			'page menu',
			async () => {
				await page.goto(pagePath);
				await page.getByRole('button', { name: 'Page menu' }).click();
				await expect(page.getByRole('menuitem').first()).toBeVisible();
			},
		],
		[
			'slash menu',
			async () => {
				await page.goto(pagePath);
				await page.getByLabel('Page content').click();
				await page.keyboard.type('/');
				await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
			},
		],
		[
			'search palette',
			async () => {
				await page.goto('/today');
				await page
					.getByRole('banner')
					.getByRole('button', { name: /^Search/ })
					.click();
				await expect(page.getByRole('dialog', { name: 'Search and go' })).toBeVisible();
			},
		],
	);
});

test.afterAll(() => page.context().close());

test('C1 noDesktopHints passes on every phone screen', async () => {
	const fails: string[] = [];
	for (const [name, path] of ROUTES) {
		try {
			await visit(path);
			await noDesktopHints(page);
		} catch (e) {
			fails.push(`${name} (${path}): ${(e as Error).message}`);
		}
	}
	expect(fails, 'desktop wording on a phone screen').toEqual([]);
});

test('C2 noDesktopHints passes with every layer open', async () => {
	const fails: string[] = [];
	for (const [name, open] of LAYERS) {
		try {
			await open();
			await noDesktopHints(page);
		} catch (e) {
			fails.push(`${name}: ${(e as Error).message}`);
		}
	}
	// leave no layer open for the next test
	await page.goto('/today');
	expect(fails, 'desktop wording inside a phone layer').toEqual([]);
});

test('C3 no visible text or accessible name matches the widened hint rule', async () => {
	const fails: string[] = [];
	for (const [name, path] of ROUTES) {
		try {
			await visit(path);
			const hits = await widenedHits();
			if (hits.length) fails.push(`screen ${name}: ${hits.join(' | ')}`);
		} catch (e) {
			fails.push(`screen ${name}: could not scan: ${(e as Error).message}`);
		}
	}
	for (const [name, open] of LAYERS) {
		try {
			await open();
			const hits = await widenedHits();
			if (hits.length) fails.push(`layer ${name}: ${hits.join(' | ')}`);
		} catch (e) {
			fails.push(`layer ${name}: could not scan: ${(e as Error).message}`);
		}
	}
	await page.goto('/today');
	expect(fails, 'desktop wording readable by TalkBack').toEqual([]);
});

test('C6 both phone projects, 48 dp where swept, Back closes the top layer first', async () => {
	expect(['phone', 'phone-landscape']).toContain(test.info().project.name);
	await page.goto('/today');
	await expectTargets48(page);

	// Back closes the Add sheet and stays on Today
	await bottomBar(page).getByRole('button', { name: 'Add' }).click();
	const add = page.getByRole('dialog', { name: 'Add' });
	await expect(add).toBeVisible();
	await expectTargets48(page);
	await page.goBack();
	await expect(add).toBeHidden();
	await expect(page).toHaveURL(/\/today/);

	// Back closes the page menu too, over the page it was opened on
	await page.goto(pagePath);
	await page.getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem').first()).toBeVisible();
	await expectTargets48(page);
	await page.goBack();
	await expect(page.getByRole('menuitem').first()).toBeHidden();
	await expect(page).toHaveURL(new RegExp(`${pagePath}$`));

	// the other layers C2 opens: the item sheet, the slash menu and the search palette
	await page.goto(`/today?item=${itemId}`);
	const item = page.getByRole('dialog', { name: 'Item' });
	await expect(item).toBeVisible();
	await expectTargets48(page);

	await page.goto(pagePath);
	await page.getByLabel('Page content').click();
	await page.keyboard.type('/');
	await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
	await expectTargets48(page);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Backspace');

	await page.goto('/today');
	await page
		.getByRole('banner')
		.getByRole('button', { name: /^Search/ })
		.click();
	await expect(page.getByRole('dialog', { name: 'Search and go' })).toBeVisible();
	await expectTargets48(page);
});

test('C7 reading the screens creates no undo entry and loses none', async () => {
	await page.goto('/today');
	const title = `Blind undo marker ${test.info().project.name}`;
	const id = await page.evaluate(async (t) => {
		const r = await fetch('/api/quickadd', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: `${t} tmr 10am /calendar` }),
		});
		if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, title);

	// read-only sweep: a few screens and one layer, no save, no tap on a mutating control
	await page.goto('/keep');
	await page.goto('/pages');
	await page.goto(pagePath);
	await page.getByLabel('Page content').click();
	await page.goto('/today');
	await page
		.getByRole('banner')
		.getByRole('button', { name: /^Search/ })
		.click();
	await expect(page.getByRole('dialog', { name: 'Search and go' })).toBeVisible();
	await page
		.getByRole('dialog', { name: 'Search and go' })
		.getByRole('button', { name: 'Close search' })
		.click();

	// the newest journal entry is still ours: nothing on the swept screens wrote one
	const undone = await page.evaluate(async () => {
		const r = await fetch('/api/undo', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		return { status: r.status, body: (await r.json()) as { label?: string } };
	});
	expect(undone.status).toBe(200);
	expect(undone.body.label).toBe(`Add "${title}"`);

	// the undo took effect: our marker is gone
	const status = await page.evaluate(async (item) => (await fetch(`/api/items/${item}`)).status, id);
	expect(status).toBe(404);
});

test('C8 the Ctrl+K tip on Pages is gated like the other hints', async () => {
	await page.goto('/pages');
	const tip = page.getByText(/Tip: Ctrl\+K/);
	// the phone surface: no Ctrl+K tip is readable. The card is hidden by the phone media query here, so the
	// `.hint` / pointer:fine gate itself is proven at 900x700 coarse in tests/e2e/v4/02-blind.spec.ts.
	await expect(tip).toBeAttached();
	await expect(tip).toBeHidden();
});
