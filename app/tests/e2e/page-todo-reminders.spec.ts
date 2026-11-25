// v4.0 PR 30: a to-do's Remind me opens the reminder picker (page_todo), the chip shows, ticking cancels.
import { expect, test } from '@playwright/test';
import { signIn } from './signin';

const BID = 'pbl_00000000000000aa';
const doc = {
	type: 'doc',
	content: [
		{
			type: 'taskList',
			content: [
				{
					type: 'taskItem',
					attrs: { checked: false, blockId: BID },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buy milk' }] }],
				},
			],
		},
	],
};
const future = () => {
	const d = new Date(Date.now() + 3 * 86_400_000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00`;
};

test('to-do reminder: set from the block tools, chip shows, ticking cancels it (#453)', async ({ page }) => {
	await signIn(page);
	const id = await page.evaluate(async (d) => {
		const r = await fetch('/api/pages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'W3 to-do reminders' }),
		});
		const p = (await r.json()) as { page: { id: string } };
		await fetch(`/api/pages/${p.page.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ doc: d }),
		});
		return p.page.id;
	}, doc);
	await page.goto(`/pages/${id}`);
	await page.getByText('Buy milk', { exact: true }).click();
	await page.getByRole('button', { name: 'Remind me', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Reminder' });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Exact reminder time').fill(future());
	await dialog.getByRole('button', { name: 'Add at time' }).click();
	await expect(dialog.getByRole('button', { name: /Remove reminder/ })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close' }).click();
	const chip = page.locator('.todo-rem');
	await expect(chip).toBeVisible();
	await expect(chip).toHaveText(/Buy milk|🔔/);
	// ticking cancels it: toast with Undo
	await page.locator('ul[data-type="taskList"] input[type="checkbox"]').check();
	await expect(page.locator('.toast')).toContainText('Reminder cancelled');
	await page.evaluate(async (x) => fetch(`/api/pages/${x}`, { method: 'DELETE' }), id);
});
