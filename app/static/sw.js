// Service worker (DESIGN §13, ADR-006): show a reminder, open its page on click. Payload = title + route only.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
