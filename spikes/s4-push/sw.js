// Service worker: payload = title + route only (DESIGN §13: no private body in a push).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
	const { title, route } = e.data.json();
	e.waitUntil(
		(async () => {
			await self.registration.showNotification(title, { data: { route }, tag: route });
			for (const c of await self.clients.matchAll({ includeUncontrolled: true }))
				c.postMessage({ title, route });
		})(),
	);
});

self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	// the route is opened as a normal page load, so the app's own auth + access checks run again
	e.waitUntil(self.clients.openWindow(e.notification.data.route));
});
