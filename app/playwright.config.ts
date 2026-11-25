import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fresh temp DB each run. First time on a PC: npx playwright install chromium
// (or set PW_CHROME=/path/to/chrome to use an installed browser).
const dir = process.env.E2E_DIR ?? mkdtempSync(join(tmpdir(), 'lt-e2e-'));
process.env.E2E_DIR = dir;
// E2E_PORT lets parallel checkouts (worktrees) run e2e at the same time
const PORT = Number(process.env.E2E_PORT ?? 4173);
// Pixel 7 at its full screen (412×915), not Playwright's 839 px browser-chrome height
const pixel7 = { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } };

export default defineConfig({
	testDir: 'tests/e2e',
	// keep phone-baseline screenshots alive across runs (Playwright clears outputDir)
	outputDir: 'test-results/run',
	workers: 1,
	fullyParallel: false,
	timeout: 60_000,
	reporter: [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		viewport: { width: 1440, height: 900 },
		timezoneId: 'Asia/Kuala_Lumpur',
		launchOptions: process.env.PW_CHROME
			? { executablePath: process.env.PW_CHROME, args: ['--no-sandbox'] }
			: {},
	},
	projects: [
		{ name: 'desktop', testIgnore: 'phone/**' },
		// phone tests only (tests/e2e/phone): npm run test:e2e:phone
		{ name: 'phone', testDir: 'tests/e2e/phone', use: pixel7 },
		{
			name: 'phone-landscape',
			testDir: 'tests/e2e/phone',
			use: { ...pixel7, viewport: { width: 915, height: 412 } },
		},
	],
	webServer: {
		command: 'npm run build && node build',
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			DATABASE_PATH: join(dir, 'app.db'),
			ORIGIN: `http://localhost:${PORT}`,
			APP_SECRET: 'e2e-secret-'.padEnd(48, 'x'),
			SETUP_TOKEN: 'e2e-setup-token-long-enough',
			PORT: String(PORT),
			HOST: '127.0.0.1',
			REMINDER_POLL_INTERVAL_MS: '2000', // reminders fire within the test's wait
			// like the Docker image (26M): the ICS import e2e uploads a 600 KB file; the app's own hooks cap still applies
			BODY_SIZE_LIMIT: '2M',
		},
	},
});
