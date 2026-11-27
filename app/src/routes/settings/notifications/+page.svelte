<!-- Settings › Notifications (FEATURES §9, D-15). Explain first, ask the browser only on a click. Three honest states:
     browser permission · this device subscribed · server can send. "Sent" never means "delivered". -->
<script lang="ts">
	import { invalidateAll } from '$lib/client/refresh';
	import { onMount } from 'svelte';
	import { get, patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { dropPush, syncPush } from '$lib/client/push';
	import { isApp } from '$lib/client/native';

	let { data } = $props();
	const u = $derived(data.user as App.SafeUser);
	/** the first switch to On sends 07:30 from the client (D-V4-30: no server-side default write) */
	const FIRST_ON = '07:30';
	/** the stored value: a failed save puts the time field back here (C12) */
	const digestTime = $derived(u.digestTime ?? FIRST_ON);
	const digestOn = $derived(!!u.digestTime);
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
	/** Daily agenda (card 12): users column only, so no undo toast — Off is the reversal (C11) */
	async function setDigest(next: string | null, input?: HTMLInputElement) {
		busy = true;
		try {
			await patch('/api/me/prefs', { digestTime: next });
			await invalidateAll();
			showToast('Saved');
		} catch (e) {
			if (input) input.value = digestTime; // C12: the control returns to the stored value
			showError(e);
		} finally {
			busy = false;
		}
	}
	function digestAt(e: Event & { currentTarget: HTMLInputElement }) {
		const v = e.currentTarget.value;
		if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) void setDigest(v, e.currentTarget);
		else e.currentTarget.value = digestTime; // a cleared/partial field shows the stored value again
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

<section class="card panel">
	<h2>Daily agenda</h2>
	<div class="digest">
		<div class="seg" role="group" aria-label="Daily agenda">
			<button
				type="button"
				aria-pressed={!digestOn}
				disabled={busy}
				class:on={!digestOn}
				onclick={() => setDigest(null)}>Off</button
			>
			<button
				type="button"
				aria-pressed={digestOn}
				disabled={busy}
				class:on={digestOn}
				onclick={() => setDigest(u.digestTime ?? FIRST_ON)}>On</button
			>
		</div>
		{#if digestOn}
			<input
				class="input time"
				type="time"
				aria-label="Daily agenda time"
				value={digestTime}
				disabled={busy}
				onchange={digestAt}
			/>
		{/if}
	</div>
	<p class="hint">One notification a day with today's items and blocks. Nothing on → no notification.</p>
	<p class="preview">{data.digestPreview ?? 'Nothing on today.'}</p>
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
	/* phone: each checkbox row is a 48 dp target (this scoped .opt beats the global label rule) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.opt {
			min-height: 48px;
		}
	}
	/* card 12: Off | On + time; the preview chip wraps instead of scrolling sideways on phone */
	.digest {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.seg {
		display: inline-flex;
		border-radius: 8px;
		overflow: hidden;
		border: 1.5px solid var(--border);
		background: var(--card);
	}
	.seg button {
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 14px;
		font-weight: 600;
		padding: 0 14px;
		height: 32px;
		cursor: pointer;
	}
	.seg button + button {
		border-left: 1px solid var(--border);
	}
	.seg button.on {
		background: var(--pill);
		color: var(--pill-ink);
	}
	.time {
		width: 120px;
	}
	.preview {
		align-self: flex-start;
		max-width: 100%;
		overflow-wrap: anywhere;
		font-size: 13px;
		padding: 6px 10px;
		border-radius: 999px;
		background: var(--pill);
		color: var(--pill-ink);
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.seg button {
			height: auto;
			min-height: 48px;
			min-width: 48px;
		}
	}
</style>
