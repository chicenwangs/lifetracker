<!-- Settings › Notifications (FEATURES §9, D-15). Explain first, ask the browser only on a click. Three honest states:
     browser permission · this device subscribed · server can send. "Sent" never means "delivered". -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get, patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { dropPush, syncPush } from '$lib/client/push';
	import { isApp } from '$lib/client/native';

	let { data } = $props();
	const u = $derived(data.user as App.SafeUser);
	let perm = $state<NotificationPermission | 'unsupported'>('default');
	let subscribed = $state(false);
	let server = $state<{ available: boolean; publicKey: string | null; devices: number } | null>(null);
	let busy = $state(false);

	const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; // prettier-ignore
	async function refresh() {
		perm = supported() ? Notification.permission : 'unsupported';
		server = await get('/api/push');
		const reg = supported() ? await navigator.serviceWorker.getRegistration('/') : undefined;
		subscribed = !!(await reg?.pushManager.getSubscription());
	}
	let app = $state(false);
	onMount(() => {
		app = isApp();
		if (!app) void refresh().catch(showError);
	});

	async function turnOn() {
		if (!server?.publicKey) return;
		busy = true;
		try {
			await navigator.serviceWorker.register('/sw.js', { scope: '/' });
			perm = await Notification.requestPermission(); // only ever on this click
			if (perm !== 'granted') return showToast('Notifications are blocked in this browser. Reminders still show inside the app.'); // prettier-ignore
			await syncPush(server.publicKey);
			showToast('Push is on for this device');
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
			await refresh().catch(() => {});
		}
	}
	async function turnOff() {
		busy = true;
		try {
			await dropPush();
			showToast('Push is off for this device');
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
			await refresh().catch(() => {});
		}
	}
	async function test() {
		try {
			const r = await post<{ sent: number; failed: number; error?: string }>('/api/push/test');
			showToast(r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It should pop up in a moment.` : `Nothing sent: no device accepted it${r.error ? ` (${r.error})` : ''}. Turn push off and on again on this device.`); // prettier-ignore
			await refresh();
		} catch (e) {
			showError(e);
		}
	}
	async function kind(p: Record<string, boolean>) {
		try {
			await patch('/api/me/prefs', p);
			await invalidateAll();
			showToast('Saved');
		} catch (e) {
			showError(e);
		}
	}
	const PERM: Record<string, string> = { granted: 'Allowed', denied: 'Blocked (change it in the browser\'s site settings)', default: 'Not asked yet', unsupported: "This browser can't do push" }; // prettier-ignore
</script>

<svelte:head><title>Notifications · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Notifications</h1>
	<p class="muted">
		Reminders (<code>/remind 2h</code> in quick add, or on an item or note) always show inside the app when it's
		open. Push also pops them up on this device when the app is closed. Nothing is asked of your browser until you
		press the button.
	</p>
	{#if app}
		<p>
			In the Android app, reminders come as phone notifications. The app fetches the next two days of
			reminders every 15 minutes and sets an alarm for each, so they ring on time even when the app is closed.
		</p>
		<p class="hint">Turn them off per kind below, or in Android's settings for Life Tracker.</p>
	{:else}
		<dl class="state">
			<dt>Server can send push</dt>
			<dd>
				{server
					? server.available
						? 'Yes'
						: 'No (the admin has not set it up; reminders stay in-app)'
					: '…'}
			</dd>
			<dt>This browser</dt>
			<dd>{PERM[perm]}</dd>
			<dt>This device</dt>
			<dd>
				{subscribed ? 'Push on' : 'Push off'}{server?.devices
					? ` · ${server.devices} device${server.devices === 1 ? '' : 's'} on your account`
					: ''}
			</dd>
		</dl>
		<div class="row">
			{#if subscribed}
				<button class="btn" type="button" disabled={busy} onclick={turnOff}
					>Turn push off on this device</button
				>
				<button class="btn" type="button" onclick={test}>Send a test</button>
			{:else}
				<button
					class="btn primary"
					type="button"
					disabled={busy || !server?.available || perm === 'unsupported' || perm === 'denied'}
					onclick={turnOn}>Turn push on for this device</button
				>
			{/if}
		</div>
		<p class="hint">
			"Sent" means a push service took it. Phones and browsers can still hold or drop it. On iPhone, push
			works only after "Add to Home Screen".
		</p>
	{/if}
</section>

<section class="card panel">
	<h2>What can remind me</h2>
	<label class="opt"
		><input
			type="checkbox"
			checked={u.notifyPlanner}
			onchange={(e) => kind({ notifyPlanner: e.currentTarget.checked })}
		/> Planner items and blocks</label
	>
	<label class="opt"
		><input
			type="checkbox"
			checked={u.notifyKeep}
			onchange={(e) => kind({ notifyKeep: e.currentTarget.checked })}
		/> Keep notes</label
	>
	<label class="opt"
		><input
			type="checkbox"
			checked={u.notifyPages}
			onchange={(e) => kind({ notifyPages: e.currentTarget.checked })}
		/> Database records</label
	>
	<p class="hint">Off = those reminders are skipped (not saved for later). No quiet hours (D-15).</p>
</section>

<style>
	.state {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 16px;
		font-size: 14px;
	}
	.state dd {
		margin: 0;
	}
	.row {
		display: flex;
		gap: 8px;
		margin: 12px 0 6px;
		flex-wrap: wrap;
	}
	.opt {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 14px;
		min-height: 32px;
	}
</style>
