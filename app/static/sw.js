// Service worker. Push (DESIGN §13, ADR-006): show a reminder, open its page on click. Payload = title + route only.
// Offline (#105, G12): cache the app shell and last-seen pages/data so opening in airplane mode shows Today at once.
// Sign-out wipes `lt-data-v1` so private data never stays behind.
const CACHE = 'lt-shell-v2';
const DATA = 'lt-data-v1';
// #205: offline copies are a convenience, not an archive: capped in count and age
const MAX_ENTRIES = 300;
const MAX_AGE_MS = 14 * 86_400_000;
const fresh = (res) => {
	const d = Date.parse(res?.headers.get('date') ?? '');
	return !!res && (Number.isNaN(d) || Date.now() - d < MAX_AGE_MS);
};
async function trim(c) {
	const keys = await c.keys(); // insertion order: oldest first
	for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await c.delete(k);
}

self.addEventListener('install', (e) => {
	self.skipWaiting();
	e.waitUntil(caches.open(CACHE).then((c) => c.add('/offline.html')));
});
self.addEventListener('activate', (e) =>
	e.waitUntil(
		(async () => {
			for (const k of await caches.keys()) if (k !== CACHE && k !== DATA) await caches.delete(k);
			await self.clients.claim();
		})(),
	),
);
self.addEventListener('fetch', (e) => {
	const r = e.request;
	const u = new URL(r.url);
	if (r.method !== 'GET' || u.origin !== self.location.origin) return;
	if (
		u.pathname.startsWith('/_app/immutable/') ||
		u.pathname === '/manifest.webmanifest' ||
		u.pathname === '/favicon.svg' ||
		u.pathname.startsWith('/icon-')
	) {
		e.respondWith(
			caches.match(r).then(
				(hit) =>
					hit ||
					fetch(r).then((res) => {
						if (res.ok) {
							const copy = res.clone();
							void caches.open(CACHE).then((c) => c.put(r, copy));
						}
						return res;
					}),
			),
		);
		return;
	}
	const isData =
		r.mode === 'navigate' ||
		u.pathname.endsWith('/__data.json') ||
		(u.pathname.startsWith('/api/') && u.pathname !== '/api/reminders/inbox' && u.pathname !== '/healthz');
	if (!isData) return;
	e.respondWith(
		(async () => {
			try {
				const res = await fetch(r);
				// session expired / revoked: what this device kept is no longer this viewer's to see (#205)
				if (res.status === 401 || res.status === 403 || res.url.includes('/login')) await caches.delete(DATA);
				if (
					res.ok &&
					!u.pathname.startsWith('/login') &&
					!u.pathname.startsWith('/setup') &&
					!res.url.includes('/login')
				) {
					const c = await caches.open(DATA);
					void c.put(r, res.clone());
					if (r.mode === 'navigate' && u.pathname === '/today' && !u.search) {
						void c.put('/today', res.clone());
					}
					void trim(c);
				}
				return res;
			} catch {
				const c = await caches.open(DATA);
				// /login offline: the sign-in page, never someone's cached Today
				if (r.mode === 'navigate' && (u.pathname.startsWith('/login') || u.pathname.startsWith('/setup')))
					return (await caches.match('/offline.html')) || Response.error();
				const pick = async (...tries) => {
					for (const t of tries) {
						const h = await t();
						if (fresh(h)) return h;
					}
					return null;
				};
				const hit = await pick(
					() => c.match(r),
					() => c.match(u.pathname),
					// #225: page data is asked for with a changing ?x-sveltekit-invalidated=…; any copy of that page will do
					() => (u.pathname.endsWith('/__data.json') ? c.match(r, { ignoreSearch: true }) : null),
					() => (r.mode === 'navigate' ? c.match('/today') : null),
					() => (r.mode === 'navigate' ? c.match('/') : null),
				);
				if (hit) return hit;
				if (r.mode === 'navigate') {
					const off = await caches.match('/offline.html');
					if (off) return off;
				}
				throw new Error('offline');
			}
		})(),
	);
});

self.addEventListener('push', (e) => {
	let p = { title: 'Reminder', body: '', route: '/', reminderId: '', sourceType: '', sourceId: '' };
	try {
		p = { ...p, ...e.data.json() };
	} catch {
		/* empty or non-JSON push: show the generic one */
	}
	e.waitUntil(
		self.registration.showNotification(p.title, {
			body: p.body,
			data: { route: p.route, reminderId: p.reminderId, sourceType: p.sourceType, sourceId: p.sourceId },
			tag: p.reminderId || p.route,
			renotify: true, // same page again = alert again (else Android swaps it in silently)
			icon: '/icon-192.png', // Android can't draw SVG notification icons
			actions: p.reminderId
				? [
						{ action: 'done', title: 'Done' },
						{ action: 'snooze10', title: 'Snooze 10 min' },
						{ action: 'tomorrow', title: 'Tomorrow' },
					]
				: [],
		}),
	);
});

self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const d = e.notification.data || {};
	if (d.reminderId && (e.action === 'done' || e.action === 'snooze10' || e.action === 'tomorrow')) {
		e.waitUntil(
			fetch(`/api/reminders/${encodeURIComponent(d.reminderId)}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: e.action }),
			}).catch(() => {}),
		);
		return;
	}
	const route = d.route || '/';
	// a normal page load: the app checks sign-in + access again before showing anything
	e.waitUntil(
		(async () => {
			const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const w = wins.find((c) => new URL(c.url).origin === self.location.origin);
			if (w) {
				await w.focus();
				return w.navigate(route);
			}
			return self.clients.openWindow(route);
		})(),
	);
});
