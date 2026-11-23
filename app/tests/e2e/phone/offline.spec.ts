// #105: Open instantly offline — cached data and queued edits; conflict rule = server wins, latest edit wins.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let T = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	T = `Airplane tick ${info.project.name}`;
});
test.afterAll(() => page.context().close());

test('airplane mode: reload Today from cache, tick an item, see Waiting to sync, syncs when back online', async () => {
	await page.goto('/today');
	const itemId = await page.evaluate(async (title) => {
		const d = new Date();
		const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, date: today, time: '23:00' }),
		});
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, T);

	// Wait for service worker to be active & controlling, then load /today once so it caches Today
	await page.evaluate(async () => {
		await navigator.serviceWorker?.ready;
	});
	await page.goto('/today');
	await expect(page.locator('.ent', { hasText: T })).toBeVisible();

	// Go offline (airplane mode) and reload /today: cached Today loads instead of the error page
	await page.context().setOffline(true);
	await page.reload();
	const row = page.locator('.ent', { hasText: T });
	await expect(row).toBeVisible();
	await expect(page.getByText(/Offline · changes aren't saved/)).toBeVisible();

	// Tick the item while offline -> queued with "Waiting to sync"
	await row.locator('button.sq').click();
	await expect(row.locator('button.sq')).toHaveAttribute('aria-label', /In progress/);
	await expect(page.getByText(/Waiting to sync \(1\)/)).toBeVisible();

	// Back online -> syncs automatically
	await page.context().setOffline(false);
	await expect(page.locator('.toast')).toContainText('Back online: 1 change(s) synced');
	const status = await page.evaluate(async (id) => {
		const r = await fetch(`/api/items/${id}`);
		return ((await r.json()) as { item: { status: string } }).item.status;
	}, itemId);
	expect(status).toBe('doing');
});

test('conflict rule: server wins when server copy changed later; latest edit wins when offline edit is newer', async () => {
	await page.goto('/today');
	const res = await page.evaluate(async () => {
		const r = await fetch('/api/items', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Server version', date: '2030-05-14', time: '10:00' }),
		});
		const id = ((await r.json()) as { item: { id: string } }).item.id;

		// 1. Offline edit made in the past (before server's updatedAt) -> server wins
		await fetch(`/api/items/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Stale offline edit', editedAt: '2020-01-01T00:00:00Z' }),
		});
		const afterStale = ((await (await fetch(`/api/items/${id}`)).json()) as { item: { title: string } }).item
			.title;

		// 2. Offline edit made after server's updatedAt -> latest edit wins
		const future = new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
		await fetch(`/api/items/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Fresh offline edit', editedAt: future }),
		});
		const afterFresh = ((await (await fetch(`/api/items/${id}`)).json()) as { item: { title: string } }).item
			.title;

		return { afterStale, afterFresh };
	});
	expect(res.afterStale).toBe('Server version');
	expect(res.afterFresh).toBe('Fresh offline edit');
});

test('Keep note: Offline status clears once the queued text is synced (#286)', async () => {
	const title = `Stale status ${test.info().project.name}`;
	await page.evaluate(async (t) => {
		await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, body: 'hello' }) }); // prettier-ignore
	}, title);
	await page.goto('/keep');
	await page.locator('article.note', { hasText: title }).getByText(title).click();
	const note = page.getByRole('dialog', { name: title, exact: true });
	const status = note.getByRole('status');
	await page.context().setOffline(true);
	await note.getByRole('textbox').nth(1).fill('typed offline');
	await expect(status).toContainText('Offline');
	await page.context().setOffline(false);
	await expect(status).toHaveText('Saved', { timeout: 15_000 });
});
