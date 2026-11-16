// Service worker. Push (DESIGN §13, ADR-006): show a reminder, open its page on click. Payload = title + route only.
// Offline (#105, G12): cache the app shell and last-seen pages/data so opening in airplane mode shows Today at once.
// Sign-out wipes `lt-data-v1` so private data never stays behind.
const CACHE = 'lt-shell-v2';
const DATA = 'lt-data-v1';

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
				}
				return res;
			} catch {
				const c = await caches.open(DATA);
				const hit =
					(await c.match(r)) ||
					(await c.match(u.pathname)) ||
					(r.mode === 'navigate'
						? (await c.match('/today')) || (await c.match('/')) || (await caches.match('/offline.html'))
						: null);
				if (hit) return hit;
				throw new Error('offline');
			}
		})(),
	);
});

self.addEventListener('push', (e) => {
	let p = { title: 'Reminder', body: '', route: '/' };
	try {
		p = { ...p, ...e.data.json() };
	} catch {
		/* empty or non-JSON push: show the generic one */
	}
	e.waitUntil(
		self.registration.showNotification(p.title, {
			body: p.body,
			data: { route: p.route },
			tag: p.route,
			renotify: true, // same page again = alert again (else Android swaps it in silently)
			icon: '/icon-192.png', // Android can't draw SVG notification icons
		}),
	);
});

self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const route = e.notification.data?.route || '/';
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
