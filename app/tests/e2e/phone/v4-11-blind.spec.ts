// Blind tests for card 11 (.ics calendar file import) on the phone projects, from its Done-when lines
// only: C11 (inline preview panel, 48 dp, no sideways scroll, no desktop copy, Back) and C12 (empty
// file, inline error). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { HINTS, expectTargets48, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop reset in the same run must not block this file
const RUN = Date.now().toString(36);
const PREFIX = `blind11p-${RUN}`;
const uid = (n: string) => `${PREFIX}-${n}`;

let page: Page;

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		for (const pw of [RESET_PW, PW]) {
			await p.fill('#u', 'jeremy');
			await p.fill('#p', pw);
			await p.click('button[type=submit]');
			await p.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!p.url().includes('/login')) break;
		}
	}
	await expect(p).not.toHaveURL(/\/(setup|login)/);
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await setHints(p, HINTS);
}

const wrap = (...blocks: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//blind 11//en', ...blocks, 'END:VCALENDAR'].join('\r\n'); // prettier-ignore
const ev = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const file = (text: string, name = 'blind11p.ics') => ({ name, mimeType: 'text/calendar', buffer: Buffer.from(text) }); // prettier-ignore

const input = () => page.getByLabel('Calendar file (.ics)');
const big = () => page.locator('.preview .big');

function runCount(): number {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return (
			db
				.prepare('SELECT count(*) AS n FROM items WHERE ics_uid LIKE ? AND deleted_at IS NULL')
				.get(`${PREFIX}%`) as {
				n: number;
			}
		).n;
	} finally {
		db.close();
	}
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const ctx = await browser.newContext({
		viewport,
		isMobile,
		hasTouch,
		userAgent,
		deviceScaleFactor,
		serviceWorkers: 'block', // route interception + a clean console
	});
	page = await ctx.newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

test.afterEach(async () => {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	const rows = db.prepare('SELECT id FROM items WHERE ics_uid LIKE ? AND deleted_at IS NULL').all(`${PREFIX}%`) as { id: string }[]; // prettier-ignore
	db.close();
	for (const r of rows) await page.evaluate((id) => fetch(`/api/items/${id}`, { method: 'DELETE' }), r.id);
});

async function openImport() {
	await page.goto('/settings');
	await page
		.getByRole('main')
		.getByRole('link', { name: /^Import/ })
		.click();
	await expect(page).toHaveURL(/\/settings\/import$/);
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('banner')).toContainText('Import');
}

// ---- C11 ---------------------------------------------------------------------------------------------------
test('C11 phone: the preview is an inline panel in the Import page at 48 dp with no sideways scroll, no desktop wording, and Back returns to Settings', async () => {
	await openImport();
	const panel = page
		.locator('section.panel')
		.filter({ has: page.getByRole('heading', { name: 'Calendar file (.ics)' }) });
	await expect(panel).toBeVisible();
	await expect(panel.locator('input[type=file]')).toHaveCount(1);

	await input().setInputFiles(
		file(
			wrap(
				ev(`UID:${uid('a')}`, 'SUMMARY:Blind11p C11', 'DTSTART:20260302T090000'),
				ev(`UID:${uid('b')}`, 'SUMMARY:Blind11p C11 skip', 'DTSTART:20260303T090000'),
			),
		),
	);
	await expect(big()).toHaveText('2 events · 0 repeating · 0 skipped');
	await expect(panel.locator('.preview .big')).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0); // inline panel, not a sheet or dialog
	await expect(page.getByRole('button', { name: 'Import 2', exact: true })).toBeVisible();

	// every row/button is 48 dp, nothing scrolls sideways, no "Click"/"Ctrl"/"Esc" copy
	await expectTargets48(page);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
	await noDesktopHints(page);

	// Back closes the section and returns to the Settings list
	await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/settings$/);
});

// ---- C12 ---------------------------------------------------------------------------------------------------
test('C12 phone states: an empty file says "No events in this file." with Import disabled, and a server error is an inline .alert with Choose another file, never a toast', async () => {
	await openImport();

	await input().setInputFiles(file(wrap(), 'empty.ics'));
	await expect(big()).toHaveText('0 events · 0 repeating · 0 skipped');
	await expect(page.getByText('No events in this file.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Import 0', exact: true })).toBeDisabled();

	// a real server refusal is an inline .alert with the server message, never a toast
	await page.reload();
	await page.waitForLoadState('networkidle');
	await page.evaluate(() =>
		(document.querySelector('form[action="?/preview"]') as HTMLFormElement).requestSubmit(),
	);
	const alert = page.locator('.preview .alert');
	await expect(alert).toHaveText('Choose a calendar file first.');
	await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0);
	await expectTargets48(page);
	expect(runCount()).toBe(0); // nothing was written by the refused previews
});
