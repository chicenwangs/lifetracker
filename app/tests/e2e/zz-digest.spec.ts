// v3.3 PR 12: daily agenda in Settings › Notifications (desktop): Off/On, time, preview, persists, bad time refused.
// Runs LAST (zz-): flow.spec.ts asserts the first visit lands on /setup, which needs the E2E DB untouched by an
// earlier spec's sign-in (this file would otherwise sort before flow and create the admin account).
import { expect, test } from '@playwright/test';
import { signIn } from './signin';

test('daily agenda: Off/On, time, preview, persisted; 25:00 is refused', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/notifications');
	await expect(page.getByRole('heading', { name: 'Daily agenda' })).toBeVisible();
	const group = page.getByRole('group', { name: 'Daily agenda' });
	await group.getByRole('button', { name: 'Off', exact: true }).click();
	await expect(page.getByLabel('Daily agenda time')).toHaveCount(0);
	await group.getByRole('button', { name: 'On', exact: true }).click();
	const time = page.getByLabel('Daily agenda time');
	await expect(time).toHaveValue('07:30');
	await expect(page.locator('.digest-preview')).toBeVisible();
	await time.fill('08:15');
	await expect(page.locator('.toast')).toContainText('Daily agenda at 08:15');
	await page.reload();
	await expect(page.getByLabel('Daily agenda time')).toHaveValue('08:15');
	const bad = await page.evaluate(async () => {
		const r = await fetch('/api/me/prefs', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ digestTime: '25:00' }),
		});
		return { s: r.status, j: (await r.json().catch(() => null)) as { error?: { message?: string } } | null };
	});
	expect(bad.s).toBe(400);
	expect(bad.j?.error?.message).toMatch(/HH:MM/);
	await group.getByRole('button', { name: 'Off', exact: true }).click();
	await expect(page.getByLabel('Daily agenda time')).toHaveCount(0);
});
