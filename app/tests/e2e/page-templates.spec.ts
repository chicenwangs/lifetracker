// v4.0 PR 22: Make template -> it leaves the tree -> New page > From template copies the content.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './signin';

async function api(page: Page, m: 'POST' | 'PATCH' | 'DELETE', p: string, b?: unknown) {
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

test('template: make it, it leaves the tree, New page from template copies the body', async ({ page }) => {
	await signIn(page);
	const T = 'W3 template page';
	const made = await api(page, 'POST', '/api/pages', { title: T });
	const id = made.j.page.id as string;
	const doc = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Template body' }] }],
	};
	expect((await api(page, 'PATCH', `/api/pages/${id}`, { doc })).s).toBe(200);
	await page.goto(`/pages/${id}`);
	// empty state: the New page menu always opens, with the hint when there are no templates
	await page.getByRole('button', { name: 'New page', exact: true }).click();
	await expect(
		page.getByText('No templates yet. Use the page menu > Make template on any page.'),
	).toBeVisible();
	await page.getByRole('menuitem', { name: 'Blank page' }).click();
	await expect.poll(() => page.url()).not.toContain(`/pages/${id}`);
	const blankId = page.url().split('/').pop() as string;
	await api(page, 'DELETE', `/api/pages/${blankId}`);
	await page.goto(`/pages/${id}`);
	await page.getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: 'Make template' }).click();
	await expect(page.locator('.tpl')).toContainText('Template · edits don');
	await expect(page.locator('.toast')).toContainText('Template created');
	const tree = page.getByRole('tree', { name: 'Page tree' });
	await expect(tree.getByText(T)).toHaveCount(0);
	// New page > From template
	await page.getByRole('button', { name: 'New page', exact: true }).click();
	const menu = page.getByRole('menu', { name: 'New page' });
	await expect(menu).toBeVisible();
	await menu.getByRole('menuitem', { name: T }).click();
	await expect.poll(() => page.url()).not.toContain(`/pages/${id}`);
	const copyId = page.url().split('/').pop() as string;
	await expect(page.getByLabel('Page title')).toHaveValue(`Untitled ${T}`);
	await expect(page.locator('.pm')).toContainText('Template body');
	await api(page, 'DELETE', `/api/pages/${id}`);
	await api(page, 'DELETE', `/api/pages/${copyId}`);
});
