// Card 12 (D-V4-13 / D-V4-30) on phone: the Daily agenda row (segmented Off | On + time) is 48 dp, its preview
// chip wraps without sideways scrolling, the first On stores 07:30, Back returns to the Settings list, and no
// keyboard copy appears.
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

test('C10 phone Daily agenda: Off | On + time at 48 dp, the preview chip fits, Back to Settings, no hints', async ({
	page,
}) => {
	await signIn(page);
	await api(page, 'PATCH', '/api/me/prefs', { digestTime: null });
	const group = page.getByRole('group', { name: 'Daily agenda' });
	const time = page.getByLabel('Daily agenda time');
	const chip = page.locator('.preview');

	try {
		await page.goto('/settings');
		await page
			.getByRole('main')
			.getByRole('link', { name: /^Notifications/ })
			.click();
		await expect(page).toHaveURL(/\/settings\/notifications$/);

		// the row, the helper and the server-rendered preview chip (today's text, or the empty sentence)
		await expect(group).toBeVisible();
		await expect(
			page.getByText("One notification a day with today's items and blocks. Nothing on → no notification."),
		).toBeVisible();
		await expect(chip).toBeVisible();
		await expect(chip).toHaveText(/^(\d+ items?|\d+ blocks?|Nothing on today\.)/);
		await expect(group.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
		await expect(time).toHaveCount(0);

		// no sideways scrolling, the chip stays inside its card
		const widths = await page.evaluate(() => {
			const c = document.querySelector('.preview') as HTMLElement;
			const p = c.closest('section') as HTMLElement;
			return {
				doc: document.documentElement.scrollWidth,
				vw: innerWidth,
				chip: c.scrollWidth,
				box: c.clientWidth,
				card: p.scrollWidth,
				cardBox: p.clientWidth,
			};
		});
		expect(widths.doc).toBeLessThanOrEqual(widths.vw);
		expect(widths.chip).toBeLessThanOrEqual(widths.box);
		expect(widths.card).toBeLessThanOrEqual(widths.cardBox);
		await expectTargets48(page);
		await noDesktopHints(page);

		// tapping On sends 07:30 (the client default) and shows the time field, both 48 dp
		await group.getByRole('button', { name: 'On' }).click();
		await expect(group.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
		await expect(time).toHaveValue('07:30');
		const sizes = await page.evaluate(() => {
			const b = document.querySelector('.seg button[aria-pressed="true"]') as HTMLElement;
			const t = document.querySelector('input[type="time"]') as HTMLElement;
			const r = (el: HTMLElement) => el.getBoundingClientRect();
			return {
				button: { w: r(b).width, h: r(b).height },
				time: { w: r(t).width, h: r(t).height },
			};
		});
		expect(Math.round(sizes.button.w)).toBeGreaterThanOrEqual(48);
		expect(Math.round(sizes.button.h)).toBeGreaterThanOrEqual(48);
		expect(Math.round(sizes.time.w)).toBeGreaterThanOrEqual(48);
		expect(Math.round(sizes.time.h)).toBeGreaterThanOrEqual(48);
		await expectTargets48(page);
		await noDesktopHints(page);

		// it is stored: a reload still shows On + 07:30
		await page.reload();
		await expect(
			page.getByRole('group', { name: 'Daily agenda' }).getByRole('button', { name: 'On' }),
		).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByLabel('Daily agenda time')).toHaveValue('07:30');

		// Back returns to the Settings list
		await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByRole('main').getByRole('link', { name: /^Notifications/ })).toBeVisible();
	} finally {
		await api(page, 'PATCH', '/api/me/prefs', { digestTime: null });
	}
});
