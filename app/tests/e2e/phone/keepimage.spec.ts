// #312: a broken image preview in a Keep note shows the filename and "unavailable", not a dead-link glyph.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('broken image preview becomes a filename card', async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({
		serviceWorkers: 'block',
		viewport,
		isMobile,
		hasTouch,
		userAgent,
		deviceScaleFactor,
	});
	const page = await ctx.newPage();
	await signIn(page);
	const title = `Broken image ${info.project.name}`;
	const id = await page.evaluate(async (t) => {
		const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)); // prettier-ignore
		const up = await fetch('/api/attachments?name=gone.png', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }); // prettier-ignore
		const att = (await up.json()) as { attachment?: { id: string }; id?: string };
		const image = att.attachment?.id ?? att.id;
		await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, body: 'x', images: [image] }) }); // prettier-ignore
		return image;
	}, title);
	expect(id).toBeTruthy();
	await page.route(`**/api/attachments/${id}`, (r) => r.fulfill({ status: 404, body: 'gone' }));
	await page.goto('/keep');
	await page.locator('article.note', { hasText: title }).getByText(title).click();
	const note = page.getByRole('dialog', { name: title, exact: true });
	const fig = note.locator('figure');
	await expect(fig).toContainText('gone.png');
	await expect(fig).toContainText('unavailable');
	await expect(fig.locator('img')).toHaveCount(0);
	await ctx.close();
});
