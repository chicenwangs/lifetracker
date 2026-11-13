// Page side: register the worker, subscribe with the server's VAPID public key, collect what the worker reports.
window.__got = [];
navigator.serviceWorker.addEventListener('message', (e) => window.__got.push(e.data));

window.__subscribe = async (vapidPublicKey) => {
	const reg = await navigator.serviceWorker.register('/s4-push/sw.js', { scope: '/s4-push/' });
	await navigator.serviceWorker.ready;
	// userVisibleOnly is required by Chrome: every push must show a notification
	const sub = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: vapidPublicKey,
	});
	return sub.toJSON();
};
window.__shown = async () => {
	const reg = await navigator.serviceWorker.getRegistration('/s4-push/');
	return (await reg.getNotifications()).map((n) => ({ title: n.title, data: n.data }));
};
window.__unsubscribe = async () => {
	const reg = await navigator.serviceWorker.getRegistration('/s4-push/');
	return (await reg.pushManager.getSubscription())?.unsubscribe();
};
