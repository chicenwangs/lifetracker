// Desktop e2e sign-in shared by specs that do not create the user themselves.
// flow.spec.ts runs first and ends by resetting jeremy's password: when a user already exists, put the known
// one back, or a later file can only pass when run alone.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const PW = 'good pass phrase';

export async function signIn(page: Page) {
	await page.goto('/');
	if (!page.url().endsWith('/setup')) {
		execFileSync('node', ['scripts/reset-password.mjs', 'jeremy'], {
			input: `${PW}\n`,
			env: { ...process.env, DATABASE_PATH: join(process.env.E2E_DIR as string, 'app.db') },
		});
		await page.goto('/');
	}
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		await page.fill('#u', 'jeremy');
		await page.fill('#p', PW);
		await page.click('button[type=submit]');
	}
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}
