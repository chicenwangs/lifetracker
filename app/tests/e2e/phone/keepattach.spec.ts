// #311: attaching an image offline says so (note kept) instead of failing silently.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('offline image attach shows an upload error and no page error', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }); // prettier-ignore
	const page = await ctx.newPage();
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await signIn(page);
	await page.goto('/keep', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /New note/ }).click();
	await page.getByRole('textbox', { name: /title/i }).fill(`Attach offline ${info.project.name}`);
	await expect(page.getByText('Saved').first()).toBeVisible();
	await ctx.setOffline(true);
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'); // prettier-ignore
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png });
	await expect(page.getByText(/Upload failed: no connection/)).toBeVisible();
	expect(errors).toEqual([]);
	await ctx.close();
});
