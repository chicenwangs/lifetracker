// Step 1: init (env + db + migrate) + proxy check + origin check + security headers.
// Step 2 adds: session load, slide, guard (see pseudocode below).
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env, initEnv } from '$lib/server/env';
import { migrateDb, openDb, setHandle } from '$lib/server/db';

export const init: ServerInit = async () => {
	const e = initEnv(privateEnv); // throws -> boot fails (fail fast)
	const h = openDb(e.DATABASE_PATH);
	migrateDb(h);
	setHandle(h);
	console.log(`[boot] db ready, origin=${e.ORIGIN}, secureCookies=${e.secureCookies}`);
	// TODO step 2+: purgeTrash, purgeExpiredSessions, purgeExpiredKeys + timers
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const handle: Handle = async ({ event, resolve }) => {
	const e = env();

	// 1 proxy: behind tunnel, header must exist (fail closed)
	if (e.ADDRESS_HEADER && !event.request.headers.get(e.ADDRESS_HEADER)) {
		return new Response('Bad request', { status: 400 });
	}

	// 2 origin: every non-GET must come from ORIGIN. Missing Origin = 403.
	if (!SAFE_METHODS.has(event.request.method)) {
		const origin = event.request.headers.get('origin');
		if (origin !== e.ORIGIN) {
			return json403(event.url.pathname.startsWith('/api/'));
		}
	}

	// 3 session + 4 guard: step 2
	//   {user, session} = loadSession(cookies); slide(session)
	//   if !user && !public(path): /api -> 401 ; else redirect /login?next=
	event.locals.user = null;
	event.locals.session = null;

	const res = await resolve(event);

	// 6 headers (CSP comes from kit.csp)
	res.headers.set('Referrer-Policy', 'same-origin');
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return res;
};

function json403(api: boolean): Response {
	return api
		? new Response(JSON.stringify({ error: { code: 'bad_origin', message: 'Bad origin' } }), {
				status: 403,
				headers: { 'content-type': 'application/json' },
			})
		: new Response('Forbidden', { status: 403 });
}

export const handleError: HandleServerError = ({ error, event, status }) => {
	// log path + status only. never body, cookies, tokens.
	const msg = error instanceof Error ? error.message : 'unknown';
	console.error(`[error] ${status} ${event.request.method} ${event.url.pathname}: ${msg}`);
	return { code: 'internal', message: 'Something broke' };
};
