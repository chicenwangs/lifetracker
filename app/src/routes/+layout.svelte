<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import { closePeek, peek } from '$lib/client/peek.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import MobileBar from '$lib/components/MobileBar.svelte';
	import MobileAdd from '$lib/components/MobileAdd.svelte';
	import ItemPeek from '$lib/components/ItemPeek.svelte';
	import { browser } from '$app/environment';
	import { initHours } from '$lib/client/hours.svelte';
	import { initTypes } from '$lib/client/itemtypes.svelte';
	import { onUndoKey } from '$lib/client/undo.svelte';
	import { watchInbox } from '$lib/client/inbox';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Tour from '$lib/components/Tour.svelte';
	import { patch } from '$lib/client/api';
	import { flushQueue, queued, wipe } from '$lib/client/offline';
	import { showToast } from '$lib/client/toast.svelte';
	let { data, children } = $props();
	// svelte-ignore state_referenced_locally
	if (browser) initHours(data.hours);
	// browser only (effects never run in SSR): module state on the server would be shared between users
	$effect.pre(() => initTypes(data.types, data.user?.hiddenTypes ?? []));
	onMount(() => (data.user ? watchInbox() : undefined));

	// PWA + offline (FEATURES §10, DESIGN §17): shell cache via the service worker, a visible offline badge,
	// Keep edits made offline sent when back. Sign-out wipes them (they may be private).
	let online = $state(true);
	async function back() {
		online = true;
		if (!data.user || !queued()) return;
		const r = await flushQueue();
		if (r.sent || r.copies) {
			showToast(r.copies ? `Back online: ${r.sent} note change(s) sent, ${r.copies} kept as "(offline copy)" because they changed elsewhere` : `Back online: ${r.sent} note change(s) sent`); // prettier-ignore
			await invalidateAll();
		}
	}
	onMount(() => {
		navigator.serviceWorker?.register('/sw.js', { scope: '/' }).catch(() => {});
		online = navigator.onLine;
		if (online) void back();
		const off = () => (online = false);
		const on = () => void back();
		const out = (e: SubmitEvent) => (e.target as HTMLFormElement).action?.endsWith('/logout') && wipe();
		addEventListener('offline', off);
		addEventListener('online', on);
		addEventListener('submit', out, true);
		return () => {
			removeEventListener('offline', off);
			removeEventListener('online', on);
			removeEventListener('submit', out, true);
		};
	});

	// welcome tour: once per user, server-side state (FEATURES §11)
	let tourOn = $state(false);
	$effect(() => {
		if (data.user?.tourState === 'new') tourOn = true;
	});
	async function endTour(state: 'done' | 'skipped') {
		tourOn = false;
		await patch('/api/me/prefs', { tourState: state }).catch(() => {});
		await invalidateAll();
	}
</script>

{#if data.user}
	<AppHeader user={data.user} />
{/if}
{@render children()}
{#if data.user && peek.id}
	{#key peek.id}
		<ItemPeek id={peek.id} origin={peek.origin ?? undefined} onclose={closePeek} />
	{/key}
{/if}
{#if data.user}
	<MobileBar />
	<MobileAdd />
{/if}
<UndoToast />
{#if !online}<div class="offline" role="status">
		Offline · changes aren't saved (Keep notes wait on this device)
	</div>{/if}
{#if tourOn && data.user}<Tour onend={endTour} />{/if}
<svelte:window onkeydown={(e) => data.user && onUndoKey(e)} />

<style>
	.offline {
		position: fixed;
		z-index: 150;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		padding: 6px 14px;
		border-radius: 999px;
		background: var(--exam-edge, #b3261e);
		color: #fff;
		font-size: 13px;
		max-width: calc(100vw - 32px);
		text-align: center;
	}
</style>
