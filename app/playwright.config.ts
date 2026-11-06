import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fresh temp DB each run. First time on a PC: npx playwright install chromium
// (or set PW_CHROME=/path/to/chrome to use an installed browser).
const dir = process.env.E2E_DIR ?? mkdtempSync(join(tmpdir(), 'lt-e2e-'));
process.env.E2E_DIR = dir;
const PORT = 4173;

export default defineConfig({
	testDir: 'tests/e2e',
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
	webServer: {
		command: 'npm run build && node build',
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			DATABASE_PATH: join(dir, 'app.db'),
			ORIGIN: `http://localhost:${PORT}`,
			APP_SECRET: 'e2e-secret-'.padEnd(48, 'x'),
			SETUP_TOKEN: 'e2e-setup-token',
			PORT: String(PORT),
			HOST: '127.0.0.1',
		},
	},
});
