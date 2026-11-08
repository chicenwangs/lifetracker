// init (env + db + migrate + purge) · proxy check · origin check · session · guard · security headers.
import { redirect, type Handle, type HandleServerError, type ServerInit } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env, initEnv } from '$lib/server/env';
import { migrateDb, openDb, setHandle } from '$lib/server/db';
import { loadSession } from '$lib/server/auth';
import { setupOpen } from '$lib/server/setup';
import { purgeAll } from '$lib/server/purge';

export const init: ServerInit = async () => {
	const e = initEnv(privateEnv); // throws -> boot fails (fail fast)
	const h = openDb(e.DATABASE_PATH);
	migrateDb(h);
	setHandle(h);
	purgeAll();
	setInterval(() => purgeAll(), 3_600_000).unref();
	// adapter-node emits this after SIGTERM/SIGINT once in-flight requests finish: close SQLite cleanly (WAL checkpoint)
	process.once('sveltekit:shutdown' as NodeJS.Signals, () => {
		try {
			h.sqlite.close();
			console.log('[shutdown] db closed');
		} catch {
			/* already closed */
		}
	});
	console.log(
		`[boot] v${process.env.APP_VERSION ?? 'dev'} db ready, origin=${e.ORIGIN}, secureCookies=${e.secureCookies}, proxyHeader=${e.ADDRESS_HEADER ?? 'none'}`,
	);
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC = [/^\/login\/?$/, /^\/signup\/?$/, /^\/setup\/?$/, /^\/healthz\/?$/];
const isPublic = (p: string) => PUBLIC.some((r) => r.test(p));

export const handle: Handle = async ({ event, resolve }) => {
	const e = env();
	const path = event.url.pathname;
	const api = path.startsWith('/api/');

	// 1 proxy: behind tunnel, header must exist (fail closed). /healthz exempt: the container's own
	// HEALTHCHECK calls 127.0.0.1 without the tunnel header, and it returns nothing private.
	if (e.ADDRESS_HEADER && path !== '/healthz' && !event.request.headers.get(e.ADDRESS_HEADER)) {
		return new Response('Bad request', { status: 400 });
	}

	// 2 origin: every non-GET must come from ORIGIN. Missing Origin = 403.
	if (!SAFE_METHODS.has(event.request.method)) {
		if (event.request.headers.get('origin') !== e.ORIGIN) return jsonOr(api, 403, 'bad_origin', 'Bad origin');
	}

	// 3 session (+ sliding)
	const s = path === '/healthz' ? null : loadSession(event.cookies);
	event.locals.user = s?.user ?? null;
	event.locals.session = s?.session ?? null;

	// 4 guard
	if (!event.locals.user && !isPublic(path)) {
		if (api) return jsonOr(true, 401, 'unauthorized', 'Log in first');
		if (setupOpen()) redirect(303, '/setup');
		const next = path + event.url.search;
		redirect(303, next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
	}

	// theme: user pref, else cookie (login page), else dark. Set on <html> server side = no flash.
	const ck = event.cookies.get('lt_theme');
	const theme = event.locals.user?.theme ?? (ck === 'light' ? 'light' : 'dark');
	const res = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lt.theme%', theme),
	});

	// 5 headers (CSP comes from kit.csp)
	res.headers.set('Referrer-Policy', 'same-origin');
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (event.locals.user) res.headers.set('Cache-Control', 'private, no-store');
	return res;
};

function jsonOr(api: boolean, status: number, code: string, message: string): Response {
	return api
		? new Response(JSON.stringify({ error: { code, message } }), {
				status,
				headers: { 'content-type': 'application/json' },
			})
		: new Response(message, { status });
}

export const handleError: HandleServerError = ({ error, event, status }) => {
	// log path + status only. never body, cookies, tokens.
	if (status === 404) return { code: 'not_found', message: 'Not found' };
	const msg = error instanceof Error ? error.message : 'unknown';
	console.error(`[error] ${status} ${event.request.method} ${event.url.pathname}: ${msg}`);
	return { code: 'internal', message: 'Something broke' };
};
