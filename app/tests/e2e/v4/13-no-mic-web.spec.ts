// Card 13 (O-7, O-8, D-V4-20): the web build has no microphone. A browser note editor shows no mic button,
// no rationale sheet and no speech path at all — voice notes are the Android app's only (PLAN §3).
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of PASSWORDS) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForURL((u) => !/^\/(login|setup)/.test(u.pathname), { timeout: 5000 }).catch(() => {});
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

test('C4 a browser note editor has no mic and no microphone rationale', async ({ page }) => {
	await signIn(page);
	const title = `No mic ${Date.now().toString(36)}`;
	await page.evaluate(async (t) => {
		await fetch('/api/keep/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: t, body: 'hello' }),
		});
	}, title);
	await page.goto('/keep');
	await page.locator('article.note', { hasText: title }).getByText(title).click();
	const note = page.getByRole('dialog', { name: title, exact: true });
	await expect(note).toBeVisible();
	const body = note.getByPlaceholder('Note');
	await expect(body).toBeVisible();

	// C4: no mic button and no "Use the microphone?" sheet anywhere
	await expect(note.getByRole('button', { name: 'Speak note' })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Use the microphone?' })).toHaveCount(0);
	expect(await page.locator('.mic').count()).toBe(0);
	// typing still works and saves with the existing autosave
	await body.fill('typed, not spoken');
	await expect(note.getByRole('status')).toContainText('Saved');
	// the Android bridge is absent in a browser: nothing could call a recognizer even if it were shown
	expect(await page.evaluate(() => 'Capacitor' in globalThis)).toBe(false);
});
