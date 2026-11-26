// v4.0 PR 17: duplicate a page from its ⋯ menu — the copy opens, and Undo removes it and returns to the source.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './signin';

async function api(page: Page, m: 'GET' | 'POST' | 'PATCH' | 'DELETE', p: string, b?: unknown) {
	return page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: (await r.json().catch(() => null)) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
		},
		[m, p, b] as const,
	);
}

test('duplicate: the copy opens with the content; Undo removes it and returns to the source', async ({
	page,
}) => {
	await signIn(page);
	const made = await api(page, 'POST', '/api/pages', { title: 'W3 dup source' });
	expect(made.s).toBe(201);
	const id = made.j.page.id as string;
	const doc = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Copy me please' }] }],
	};
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { doc })).s).toBe(200);
	await page.goto(`/pages/${id}`);
	await page.getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: 'Duplicate' }).click();
	await expect.poll(() => page.url()).not.toContain(`/pages/${id}`);
	const copyId = page.url().split('/').pop() as string;
	await expect(page.getByLabel('Page title')).toHaveValue('Copy of W3 dup source');
	await expect(page.locator('.tiptap')).toContainText('Copy me please');
	expect((await api(page, 'GET', `/api/pages/${copyId}`)).s).toBe(200);
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Duplicated page');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => page.url()).toContain(`/pages/${id}`);
	await expect.poll(async () => (await api(page, 'GET', `/api/pages/${copyId}`)).s).toBe(404);
	await api(page, 'DELETE', `/api/pages/${id}`);
});
