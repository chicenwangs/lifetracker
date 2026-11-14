// Web Push on this device (D-23). Used by Settings › Notifications (turn on) and the app shell (re-sync on load).
import { apiFetch, get, post } from './api';

const key = (b64: string) => {
	const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const same = (a: ArrayBuffer | null | undefined, b: Uint8Array) =>
	!!a && new Uint8Array(a).join() === b.join();

/** subscribe this device (or replace a stale subscription) and tell the server. Permission must be granted. */
export async function syncPush(publicKey: string): Promise<void> {
	const reg = await navigator.serviceWorker.ready;
	const want = key(publicKey);
	let sub = await reg.pushManager.getSubscription();
	if (sub && !same(sub.options.applicationServerKey, want)) {
		await sub.unsubscribe(); // server VAPID keys changed: the old subscription can never be sent to
		sub = null;
	}
	sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
	await post('/api/push', sub.toJSON());
}

/** turn push off on this device: server row first (it stops sending at once), then the browser's */
export async function dropPush(): Promise<void> {
	const sub = await (await navigator.serviceWorker?.getRegistration('/'))?.pushManager.getSubscription();
	if (!sub) return;
	await apiFetch('DELETE', '/api/push', { endpoint: sub.endpoint });
	await sub.unsubscribe();
}

/** app load: if this device had push on, send its subscription again. The server may have dropped it
 *  (410 from the push service, new keys, a restore), while the phone still says "allowed". */
export async function resyncPush(): Promise<void> {
	if (window.Notification?.permission !== 'granted' || !('PushManager' in window)) return;
	const reg = await navigator.serviceWorker.ready;
	if (!(await reg.pushManager.getSubscription())) return; // user turned it off here: leave it off
	const s = await get<{ publicKey: string | null }>('/api/push');
	if (s.publicKey) await syncPush(s.publicKey);
}
