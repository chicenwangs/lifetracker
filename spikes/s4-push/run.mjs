// S-4: Web Push end to end on this PC (DESIGN §13). Run: npm run s4   (S4_BROWSERS=chrome,msedge)
// Real installed browsers with a throwaway profile: the bundled test Chromium has no push service keys.
// Sends one test push per browser through that browser's push service (outbound HTTPS from this machine).
// NOT covered here: the homelab's outbound 443, the Cloudflare Tunnel origin, Android, iOS. See ADR-006.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import * as webpush from 'web-push';
import { check, finish } from '../lib/harness.mjs';

const ORIGIN = 'http://localhost:5199'; // localhost counts as a secure context: service workers + push allowed
const keys = webpush.generateVAPIDKeys(); // per run; the app keeps its pair in env (never DB/git)
const vapid = {
	subject: 'mailto:push-spike@localhost.test',
	publicKey: keys.publicKey,
	privateKey: keys.privateKey,
};

const server = await createServer({
	root: fileURLToPath(new URL('..', import.meta.url)),
	logLevel: 'error',
	server: { port: 5199, strictPort: true },
});
await server.listen();

for (const channel of (process.env.S4_BROWSERS ?? 'msedge,chrome').split(',')) {
	const profile = mkdtempSync(join(tmpdir(), `lt-s4-${channel}-`));
	let ctx;
	try {
		ctx = await chromium.launchPersistentContext(profile, { channel, headless: false });
	} catch (e) {
		// not a failure of the spike: just can't be checked on this machine
		console.log(`SKIP  ${channel}: not installed here (${e.message.split('\n')[0].slice(0, 70)}…)`);
		continue;
	}
	try {
		await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
		const page = ctx.pages()[0] ?? (await ctx.newPage());
		const csp = [];
		page.on('console', (m) => m.text().includes('Content Security Policy') && csp.push(m.text()));
		await page.goto(`${ORIGIN}/s4-push/`);

		const sub = await page
			.evaluate((k) => window.__subscribe(k), keys.publicKey)
			.catch((e) => ({ error: e.message }));
		const host = sub.endpoint ? new URL(sub.endpoint).host : '';
		check(`${channel}: subscribes with our VAPID key`, !!sub.endpoint, sub.error ?? `push service ${host}`);
		if (!sub.endpoint) continue;

		const t0 = Date.now();
		const sent = await webpush
			.sendNotification(sub, JSON.stringify({ title: 'Spike reminder', route: '/s4-push/?from=push' }), {
				vapidDetails: vapid,
				TTL: 60,
			})
			.catch((e) => e);
		check(`${channel}: push service accepts the message`, sent.statusCode === 201, `HTTP ${sent.statusCode}`);

		const arrived = await page
			.waitForFunction(() => window.__got.length > 0, null, { timeout: 30_000 })
			.then(() => true, () => false); // prettier-ignore
		check(
			`${channel}: service worker receives it`,
			arrived,
			arrived ? `${Date.now() - t0} ms after send` : 'nothing in 30 s',
		);
		const shown = arrived ? await page.evaluate(() => window.__shown()) : [];
		check(
			`${channel}: notification shown, payload is title + route only`,
			shown[0]?.title === 'Spike reminder' && shown[0]?.data.route === '/s4-push/?from=push',
			JSON.stringify(shown[0] ?? null),
		);

		// dead subscription. Observed: Edge/WNS still answers 201 right after unsubscribe, so the app must delete
		// the row itself when the user turns push off; 404/410 is only a later clean-up signal.
		await page.evaluate(() => window.__unsubscribe());
		const gone = await webpush
			.sendNotification(sub, '{"title":"x","route":"/"}', { vapidDetails: vapid, TTL: 60 })
			.catch((e) => e);
		check(
			`${channel}: send to an unsubscribed endpoint does not blow up`,
			[201, 404, 410].includes(gone.statusCode),
			`HTTP ${gone.statusCode}${gone.statusCode === 201 ? ' (still accepted: no instant revoke signal)' : ''}`,
		);
		check(`${channel}: works under the app CSP`, csp.length === 0, csp[0] ?? '');
	} finally {
		await ctx.close();
		rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
	}
}
await server.close();
finish();
