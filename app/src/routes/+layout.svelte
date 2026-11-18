<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import { closePeek, openItem, peek } from '$lib/client/peek.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import MobileBar from '$lib/components/MobileBar.svelte';
	import PullRefresh from '$lib/components/PullRefresh.svelte';
	import MobileAdd from '$lib/components/MobileAdd.svelte';
	import ItemPeek from '$lib/components/ItemPeek.svelte';
	import { browser } from '$app/environment';
	import { initHours } from '$lib/client/hours.svelte';
	import { initTypes } from '$lib/client/itemtypes.svelte';
	import { onUndoKey } from '$lib/client/undo.svelte';
	import { watchInbox } from '$lib/client/inbox';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate, replaceState } from '$app/navigation';
	import { invalidateAll } from '$lib/client/refresh';
	import { leavingPage } from '$lib/client/layers';
	import Tour from '$lib/components/Tour.svelte';
	import { patch } from '$lib/client/api';
	import { flushQueue, queued, wipe } from '$lib/client/offline';
	import { showToast } from '$lib/client/toast.svelte';
	import { dropPush, resyncPush } from '$lib/client/push';
	import { signOutNative } from '$lib/client/native';
	let { data, children } = $props();
	// svelte-ignore state_referenced_locally
	if (browser) initHours(data.hours);
	// browser only (effects never run in SSR): module state on the server would be shared between users
	$effect.pre(() => initTypes(data.types, data.user?.hiddenTypes ?? []));
	onMount(() => (data.user ? watchInbox() : undefined));
	beforeNavigate(leavingPage); // a link inside a menu or sheet must not be undone by its Back entry (#91)
	// reminder notification tap (#112): /today?item=<id> opens that item's sheet over the screen
	afterNavigate(() => {
		const item = new URLSearchParams(location.search).get('item');
		if (!item) return;
		const u = new URL(location.href);
		u.searchParams.delete('item');
		setTimeout(() => {
			replaceState(u.pathname + u.search + u.hash, {});
			openItem(item);
		});
	});

	// PWA + offline (FEATURES §10, DESIGN §17, #105): shell + last-seen data cache via the service worker,
	// a visible offline / Waiting to sync badge, Keep + planner edits queued offline and sent when back.
	let online = $state(true);
	let waiting = $state(0);
	async function back() {
		online = true;
		waiting = queued();
		if (!data.user || !waiting) return;
		const r = await flushQueue();
		waiting = queued();
		if (r.sent || r.copies || r.planner) {
			const msg = r.copies
				? `Back online: ${r.sent} note change(s) sent, ${r.copies} kept as "(offline copy)" because they changed elsewhere`
				: r.sent && !r.planner
					? `Back online: ${r.sent} note change(s) sent`
					: `Back online: ${r.sent + r.planner} change(s) synced`;
			showToast(msg);
			await invalidateAll();
		}
	}
	onMount(() => {
		navigator.serviceWorker?.register('/sw.js', { scope: '/' }).catch(() => {});
		if (data.user && navigator.serviceWorker) void resyncPush().catch(() => {});
		online = navigator.onLine;
		waiting = queued();
		if (online) void back();
		const off = () => (online = false);
		const on = () => void back();
		const syncCount = () => (waiting = queued());
		const out = (e: SubmitEvent) => {
			const f = e.target as HTMLFormElement;
			if (!f.action?.endsWith('/logout') || f.dataset.out) return;
			wipe();
			// a signed-out phone must not keep showing private reminder titles: drop its push first (max 2 s)
			e.preventDefault();
			f.dataset.out = '1';
			const late = new Promise((r) => setTimeout(r, 2000));
			void Promise.race([Promise.all([dropPush().catch(() => {}), signOutNative()]), late]).then(() =>
				f.requestSubmit(),
			);
		};
		// keyboard opened (the page shrank, interactive-widget=resizes-content): keep the field you type in on screen (#118)
		const keep = () => {
			const f = document.activeElement as HTMLElement | null;
			if (f && (f.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)))
				f.scrollIntoView({ block: 'nearest' });
		};
		visualViewport?.addEventListener('resize', keep);
		addEventListener('offline', off);
		addEventListener('online', on);
		addEventListener('lt:queue', syncCount);
		addEventListener('submit', out, true);
		return () => {
			visualViewport?.removeEventListener('resize', keep);
			removeEventListener('offline', off);
			removeEventListener('online', on);
			removeEventListener('lt:queue', syncCount);
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
	<PullRefresh />
	<MobileAdd />
{/if}
<UndoToast />
<Dialog />
{#if !online}<div class="offline" role="status">
		Offline · changes aren't saved (Keep notes wait on this device){#if waiting}
			· Waiting to sync ({waiting}){/if}
	</div>{:else if waiting}<div class="offline" role="status">
		Waiting to sync ({waiting})
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
