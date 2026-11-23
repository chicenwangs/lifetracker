// #288: signing out while a notes edit still waits on its 700 ms autosave saves it first.
import { expect, test } from '@playwright/test';
import { PW, signIn } from './helpers';

test('sign out right after typing notes keeps the notes', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	const page = await ctx.newPage();
	await signIn(page);
	const T = `Signout save ${info.project.name}`;
	const BODY = `typed just before sign-out ${info.project.name}`;
	const id = await page.evaluate(async (title) => {
		const r = await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, date: '2030-05-14', time: '10:00' }) }); // prettier-ignore
		return ((await r.json()) as { item: { id: string } }).item.id;
	}, T);
	await page.goto('/week?w=2030-05-13');
	await page.getByRole('link', { name: new RegExp(T) }).click();
	const sheet = page.getByRole('dialog', { name: 'Item' });
	await sheet.getByText('Tap to write notes').click();
	await page.keyboard.type(BODY);
	// no wait: the autosave timer is still pending when the sign-out form is submitted
	await page.evaluate(() => {
		const f = document.createElement('form');
		f.method = 'post';
		f.action = '/logout';
		document.body.append(f);
		f.requestSubmit();
	});
	await expect(page).toHaveURL(/\/login/);
	await page.fill('#u', 'jeremy');
	await page.fill('#p', PW);
	await page.click('button[type=submit]');
	await expect(page).not.toHaveURL(/\/login/);
	const notes = await page.evaluate(async (i) => {
		const r = await fetch(`/api/items/${i}/view`);
		return ((await r.json()) as { item: { notes: string | null } }).item.notes;
	}, id);
	expect(notes).toBe(BODY);
	await ctx.close();
});
