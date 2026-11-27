// Card 10 (D-V4-11, D-V4-28) on phone: Settings › Types fits without sideways scroll (Order and Used hidden,
// Month calendar kept, 48 dp switch, Back to Settings), and the phone Month grid drops my items of an off type
// while planner blocks keep their dots and rows.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

const api = (page: Page, m: string, p: string, b?: unknown) =>
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
interface TypeRow {
	id: string;
	key: string;
	name: string;
	onCalendar: boolean;
}
const types = async (page: Page) =>
	((await api(page, 'GET', '/api/item-types')).j as { types: TypeRow[] }).types;
const stored = async (page: Page, key: string) => (await types(page)).find((t) => t.key === key)?.onCalendar;
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return r.j.item.id as string;
};
const mkBlock = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/blocks', body);
	expect(r.s).toBe(201);
	return r.j.block.id as string;
};

/** the shared e2e DB keeps what earlier specs wrote: start with the old behaviour (all types on the Month) */
async function reset(page: Page) {
	await api(page, 'PATCH', '/api/me/prefs', { hiddenTypes: [] });
	for (const t of await types(page))
		if (!t.onCalendar) await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: true });
}

test('C2/C9 phone Settings › Types: Month calendar switch, 48 dp, Order and Used hidden, no sideways scroll, Back', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	await page.goto('/settings');
	await page
		.getByRole('main')
		.getByRole('link', { name: /^Item types/ })
		.click();
	await expect(page).toHaveURL(/\/settings\/types$/);

	// C9: the four columns stay; Order and Used are gone; the table fits its card at 412 px
	await expect(page.getByRole('columnheader', { name: 'Colour' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Name', exact: true })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Quick add' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Month calendar' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Order' })).toBeHidden();
	await expect(page.getByRole('columnheader', { name: 'Used', exact: true })).toBeHidden();
	// the two older flag columns sit out too: five narrow columns keep every input at 48 dp with no sideways scroll
	await expect(page.getByRole('columnheader', { name: 'Counts down' })).toBeHidden();
	await expect(page.getByRole('columnheader', { name: 'Share by default' })).toBeHidden();
	const widths = await page.evaluate(() => {
		const p = document.querySelector('section.panel') as HTMLElement;
		return {
			doc: document.documentElement.scrollWidth,
			vw: innerWidth,
			body: p.scrollWidth,
			box: p.clientWidth,
		};
	});
	expect(widths.doc).toBeLessThanOrEqual(widths.vw);
	expect(widths.body).toBeLessThanOrEqual(widths.box);

	// the switch is there for every type, on, and its label is a 48 dp tap area
	const list = await types(page);
	for (const t of list)
		await expect(page.getByRole('switch', { name: `Month calendar for ${t.name}` })).toBeChecked();
	const sw = page.getByRole('switch', { name: 'Month calendar for Work' });
	const label = await sw.evaluate((n) => {
		const r = (n.closest('label') as HTMLElement).getBoundingClientRect();
		return { w: r.width, h: r.height };
	});
	expect(Math.round(label.w)).toBeGreaterThanOrEqual(48);
	expect(Math.round(label.h)).toBeGreaterThanOrEqual(48);
	await expectTargets48(page);
	await noDesktopHints(page);

	// C2/C9: tapping it saves at once; a reload shows it off; tapping again brings it back
	await sw.click();
	await expect.poll(() => stored(page, 'Work')).toBe(false);
	await page.reload();
	await expect(page.getByRole('switch', { name: 'Month calendar for Work' })).not.toBeChecked();
	await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
	await expect.poll(() => stored(page, 'Work')).toBe(true);

	// C9: Back returns to the Settings list
	await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('main').getByRole('link', { name: /^Item types/ })).toBeVisible();
});

test('C4/C8 phone Month: off type items leave the dots and agenda, blocks keep theirs; on → they return', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	const stamp = Date.now().toString(36);
	const today = await day(page, 0);
	const ym = today.slice(0, 7);
	const mine = await mkItem(page, { title: `Phone class ${stamp}`, type: 'Work', date: today });
	const other = await mkItem(page, { title: `Phone party ${stamp}`, type: 'Event', date: today });
	const block = await mkBlock(page, {
		label: `Phone block ${stamp}`,
		type: 'Work',
		startAt: `${today}T01:00:00Z`, // 09:00 KL
		endAt: `${today}T02:00:00Z`,
	});
	const cell = page.locator('.cell[aria-current="date"]');
	/** "Sat 27 Nov 2026, 3 planned" -> 3 */
	const planned = async () =>
		Number((await cell.getAttribute('aria-label'))?.match(/, (\d+) planned$/)?.[1] ?? -1);

	try {
		// the shared DB can hold other rows on today: assert the change, not an absolute count
		await page.goto(`/month?m=${ym}&d=${today}`);
		await expect(page.getByText(`Phone class ${stamp}`)).toBeVisible();
		await expect(page.getByText(`Phone party ${stamp}`)).toBeVisible();
		await expect(page.getByText(`Phone block ${stamp}`)).toBeVisible();
		const n = await planned();
		expect(n).toBeGreaterThanOrEqual(3);

		// the switch goes off through Settings (the page under test)
		await page.goto('/settings/types');
		await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
		await expect.poll(() => stored(page, 'Work')).toBe(false);

		// C4: the Work item is absent (no disabled chip), the block keeps its dot and its agenda row
		await page.goto(`/month?m=${ym}&d=${today}`);
		await expect(page.getByText(`Phone class ${stamp}`)).toHaveCount(0);
		await expect(page.getByText(`Phone party ${stamp}`)).toBeVisible();
		await expect(page.getByText(`Phone block ${stamp}`)).toBeVisible();
		await expect.poll(planned).toBe(n - 1);
		await noDesktopHints(page);

		// C8: back on → it returns
		await page.goto('/settings/types');
		await page.getByRole('switch', { name: 'Month calendar for Work' }).click();
		await expect.poll(() => stored(page, 'Work')).toBe(true);
		await page.goto(`/month?m=${ym}&d=${today}`);
		await expect(page.getByText(`Phone class ${stamp}`)).toBeVisible();
		await expect.poll(planned).toBe(n);
	} finally {
		for (const id of [mine, other])
			await page.evaluate((i) => fetch(`/api/items/${i}`, { method: 'DELETE' }), id);
		await page.evaluate((i) => fetch(`/api/blocks/${i}`, { method: 'DELETE' }), block);
		await reset(page);
	}
});
