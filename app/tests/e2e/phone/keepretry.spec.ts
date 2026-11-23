// #308 #309: Retry after a lost create reply must not make a second note.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('Retry after the server saved but the reply failed keeps one note', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }); // prettier-ignore
	const page = await ctx.newPage();
	await signIn(page);
	const T = `Retry once ${info.project.name}`;
	let lost = false;
	await page.route('**/api/keep/notes', async (r) => {
		if (r.request().method() !== 'POST' || lost) return r.continue();
		lost = true;
		await r.fetch(); // the server creates it ...
		await r.fulfill({ status: 500, body: '{}' }); // ... the client never hears
	});
	await page.goto('/keep', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /New note/ }).click();
	await page.getByRole('textbox', { name: /title/i }).fill(T);
	await page.getByRole('button', { name: /Save failed/ }).click();
	await expect(page.getByText(/Saved/).first()).toBeVisible();
	const n = await page.evaluate(async (t) => {
		const r = await fetch('/api/keep/notes');
		return ((await r.json()) as { notes: { title: string }[] }).notes.filter((x) => x.title === t).length;
	}, T);
	expect(n).toBe(1);
	await ctx.close();
});
