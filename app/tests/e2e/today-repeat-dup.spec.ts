// #398: a repeating item created with /both (item + linked block) must appear once on Today, with Skip this one.
import { expect, test } from '@playwright/test';
import { signIn } from './signin';

test('a repeating item with its linked block lists once on Today (#398)', async ({ page }) => {
	await signIn(page);
	const made = await page.evaluate(async () => {
		const r = await fetch('/api/quickadd', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: 'Repeat dup today 9am to 10am /both every day' }),
		});
		return (await r.json()) as {
			item?: { id: string };
			block?: { id: string };
			problems?: string[];
		};
	});
	expect(made.problems ?? []).toEqual([]);
	expect(made.item?.id).toBeTruthy();
	expect(made.block?.id).toBeTruthy();
	await page.goto('/today');
	await expect(page.getByRole('button', { name: 'Repeat dup', exact: true })).toHaveCount(1);
	// the item row keeps the repeating skip action (owner decision a)
	await page.getByRole('button', { name: 'Actions for Repeat dup' }).click();
	await expect(page.getByRole('button', { name: 'Skip this one' })).toBeVisible();
	await page.evaluate(
		async (ids) => {
			await fetch(`/api/items/${ids.item}`, { method: 'DELETE' });
			if (ids.block) await fetch(`/api/blocks/${ids.block}`, { method: 'DELETE' });
		},
		{ item: made.item!.id, block: made.block?.id ?? '' },
	);
});
