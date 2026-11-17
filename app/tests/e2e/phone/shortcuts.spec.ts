// #117: App icon shortcuts (Add item, New note, Today) and Share target (shared text / link -> new Keep note, opened for editing).
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test('manifest declares Add item, New note, Today shortcuts and share_target', async () => {
	const m = await page.evaluate(async () => {
		const r = await fetch('/manifest.webmanifest');
		return (await r.json()) as {
			shortcuts: { name: string; url: string }[];
			share_target: { action: string; params: Record<string, string> };
		};
	});
	expect(m.shortcuts.map((s) => [s.name, s.url])).toEqual([
		['Add item', '/today?add=1'],
		['New note', '/keep?new=1'],
		['Today', '/today'],
	]);
	expect(m.share_target).toMatchObject({
		action: '/keep',
		params: { title: 'title', text: 'text', url: 'url' },
	});
});

test('Add item and New note shortcuts open their editors directly', async () => {
	await page.goto('/today?add=1');
	await expect(page.getByRole('dialog', { name: 'Add' })).toBeVisible();
	await page.goBack();
	await expect(page.getByRole('dialog', { name: 'Add' })).toBeHidden();

	await page.goto('/keep?new=1');
	const note = page.locator('.note[role="dialog"]');
	await expect(note).toBeVisible();
	await page.goBack();
	await expect(note).toBeHidden();
});

test('sharing a link with a page title creates a new Keep note and opens it for editing', async () => {
	await page.goto('/keep?share=1&title=Svelte+5+Runes&text=https%3A%2F%2Fsvelte.dev%2Fdocs');
	const dlg = page.locator('.note[role="dialog"]');
	await expect(dlg).toBeVisible();
	await expect(dlg.getByPlaceholder('Title')).toHaveValue('Svelte 5 Runes');
	await expect(dlg.getByPlaceholder('Note')).toHaveValue('https://svelte.dev/docs');
	await page.goBack();
	await expect(dlg).toBeHidden();
	await expect(page.locator('article.note', { hasText: 'Svelte 5 Runes' }).first()).toBeVisible();
});

test('sharing multi-line text uses the first line as title and the rest as body', async () => {
	await page.goto('/keep?share=1&text=Shared+first+line%0ASecond+line%0AThird+line');
	const dlg = page.locator('.note[role="dialog"]');
	await expect(dlg).toBeVisible();
	await expect(dlg.getByPlaceholder('Title')).toHaveValue('Shared first line');
	await expect(dlg.getByPlaceholder('Note')).toHaveValue('Second line\nThird line');
	await page.goBack();
	await expect(dlg).toBeHidden();
	await expect(page.locator('article.note', { hasText: 'Shared first line' }).first()).toBeVisible();
});

test('a share link alone saves nothing: the note is saved only when you close it', async () => {
	const word = `Planted${test.info().project.name.replace(/\W/g, '')}`;
	const count = () =>
		page.evaluate(async (w) => {
			const r = await fetch(`/api/keep/notes?q=${w}`);
			return ((await r.json()) as { notes: unknown[] }).notes.length;
		}, word);
	await page.goto(`/keep?share=1&text=${word}`);
	await expect(page.locator('.note[role="dialog"]')).toBeVisible();
	await page.waitForTimeout(1500); // longer than the 600 ms autosave
	expect(await count()).toBe(0);
	await page.goBack();
	await expect.poll(count).toBe(1);
});
