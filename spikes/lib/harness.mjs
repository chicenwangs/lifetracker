// Shared by the spike runners: start vite, open a browser page, collect pass/fail rows, exit 1 on any fail.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export async function withPage(path, fn, launch = {}) {
	const server = await createServer({
		root: fileURLToPath(new URL('..', import.meta.url)),
		logLevel: 'error',
		server: { port: 5199, strictPort: true },
	});
	await server.listen();
	const base = 'http://localhost:5199';
	const browser = await chromium.launch(launch);
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const hosts = new Set();
	page.on('request', (r) => hosts.add(new URL(r.url()).host));
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	try {
		await page.goto(base + path);
		await fn(page, { hosts, errors, base });
	} finally {
		await browser.close();
		await server.close();
	}
}

const rows = [];
export function check(name, ok, detail = '') {
	rows.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
export function finish() {
	const bad = rows.filter((r) => !r.ok).length;
	console.log(`\n${rows.length - bad}/${rows.length} checks passed`);
	process.exit(bad ? 1 : 0);
}
