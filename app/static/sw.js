// Service worker. Push (DESIGN §13, ADR-006): show a reminder, open its page on click. Payload = title + route only.
// PWA (DESIGN §17): cache only hashed build files + the offline page. Never pages or /api (private data, always fresh).
const CACHE = 'lt-shell-v1';
self.addEventListener('install', (e) => {
	self.skipWaiting();
	e.waitUntil(caches.open(CACHE).then((c) => c.add('/offline.html')));
});
self.addEventListener('activate', (e) =>
	e.waitUntil(
		(async () => {
			for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
			await self.clients.claim();
		})(),
	),
);
self.addEventListener('fetch', (e) => {
	const r = e.request;
	const u = new URL(r.url);
	if (r.method !== 'GET' || u.origin !== self.location.origin) return;
	if (u.pathname.startsWith('/_app/immutable/'))
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
	else if (r.mode === 'navigate') e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
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
			icon: '/favicon.svg',
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
