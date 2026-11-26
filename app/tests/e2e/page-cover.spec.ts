// v4.0 PR 31: page cover — add from the page menu, persists on reload, change, remove + Undo.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './signin';

const PNG = Buffer.from(
	'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c62f8cfc0f01f00050001ff9a5ee73f0000000049454e44ae426082',
	'hex',
);
async function api(page: Page, m: 'POST' | 'DELETE', p: string, b?: unknown) {
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

test('cover: add, reload keeps it, change, remove with Undo', async ({ page }) => {
	await signIn(page);
	const made = await api(page, 'POST', '/api/pages', { title: 'W3 cover page' });
	const id = made.j.page.id as string;
	await page.goto(`/pages/${id}`);
	await page.getByRole('button', { name: 'Page menu' }).click();
	await expect(page.getByRole('menuitem', { name: 'Add cover…' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Add cover…' }).click();
	const picker = page.getByRole('dialog', { name: 'Cover picker' });
	await expect(picker).toBeVisible();
	await page
		.getByLabel('Cover image')
		.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
	const img = page.locator('.cover img');
	await expect(img).toBeVisible();
	const first = (await img.getAttribute('src')) as string;
	expect(first).toMatch(/^\/api\/attachments\/att_/);
	expect(await page.evaluate(async (s) => (await fetch(s)).status, first)).toBe(200);
	await page.reload();
	await expect(page.locator('.cover img')).toHaveAttribute('src', first);
	// change: upload another image
	await page
		.getByLabel('Cover image')
		.setInputFiles({ name: 'cover2.png', mimeType: 'image/png', buffer: PNG });
	await expect(page.locator('.cover img')).not.toHaveAttribute('src', first);
	// change again: pick the image already uploaded
	await page.getByRole('button', { name: 'Page menu' }).click();
	await page.getByRole('menuitem', { name: 'Change cover…' }).click();
	await expect(picker).toBeVisible();
	await picker.getByRole('button', { name: 'cover.png' }).click();
	await expect(page.locator('.cover img')).toHaveAttribute('src', first);
	// remove, then Undo puts it back
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect(page.locator('.cover')).toHaveCount(0);
	await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator('.cover img')).toHaveAttribute('src', first);
	await api(page, 'DELETE', `/api/pages/${id}`);
});
