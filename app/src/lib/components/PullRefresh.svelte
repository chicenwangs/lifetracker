<!-- Phone pull to refresh (#103, G11): on a tab screen at the very top, pull down past the line and let go = fetch
     fresh data. The browser's own pull (reloads the page) is off on phone (app.css overscroll-behavior). Tap path:
     re-tap the open tab while at the top (MobileBar). TalkBack: the sr-only Refresh button.
     Also refreshes quietly when the app comes back after 30 s+ (#113). -->
<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { isPhone } from '$lib/client/phone';
	import { buzz } from '$lib/client/haptics';
	import { invalidateAll } from '$lib/client/refresh';

	const ROOTS = ['/', '/today', '/week', '/month', '/keep', '/pages'];
	const LINE = 72; // px of pull (after damping) that refreshes
	let pull = $state(0);
	let busy = false;
	let spin = $state(false); // the spinner: at once for a pull or tap, after 1 s for a quiet refresh
	const onTab = $derived(ROOTS.includes(page.url.pathname));

	async function run(quiet = false) {
		if (busy) return;
		busy = true;
		const slow = quiet ? setTimeout(() => (spin = true), 1000) : null;
		spin = !quiet;
		try {
			await invalidateAll();
		} finally {
			if (slow) clearTimeout(slow);
			busy = spin = false;
		}
	}

	// #113: back to the front after a while (app resumed, tab shown again) = refresh this screen quietly, scroll kept
	onMount(() => {
		let away = 0;
		const vis = () => {
			if (document.hidden) away = Date.now();
			else if (away && Date.now() - away > 30_000 && isPhone()) void run(true);
		};
		document.addEventListener('visibilitychange', vis);
		return () => document.removeEventListener('visibilitychange', vis);
	});

	onMount(() => {
		let y0: number | null = null;
		let x0 = 0;
		let armed = false;
		const start = (e: TouchEvent) => {
			const t = e.target as Element;
			y0 = null;
			if (!isPhone() || !onTab || busy || scrollY > 0 || e.touches.length > 1) return;
			// not from inside a sheet, dialog, menu or a lifted row
			if (t.closest?.('[role="dialog"], [role="menu"], [popover], .lt-lifted, textarea, [contenteditable]'))
				return;
			const p = e.touches[0];
			if (p) [x0, y0] = [p.clientX, p.clientY];
		};
		const move = (e: TouchEvent) => {
			const p = e.touches[0];
			if (y0 === null || !p) return;
			const dy = p.clientY - y0;
			const dx = p.clientX - x0;
			// sideways first (row swipe, peer swipe) or up, or a row picked up: not ours
			if ((pull === 0 && Math.abs(dx) > Math.abs(dy)) || dy <= 0 || scrollY > 0 || document.querySelector('.lt-lifted')) {
				y0 = null;
				pull = 0;
				return;
			}
			pull = Math.min(120, dy * 0.5);
			if (!armed && pull >= LINE) buzz('tick');
			armed = pull >= LINE;
		}; // prettier-ignore
		const end = () => {
			if (y0 === null) return;
			y0 = null;
			if (armed) void run();
			armed = false;
			pull = 0;
		};
		addEventListener('touchstart', start, { passive: true });
		addEventListener('touchmove', move, { passive: true });
		addEventListener('touchend', end);
		addEventListener('touchcancel', end);
		return () => {
			removeEventListener('touchstart', start);
			removeEventListener('touchmove', move);
			removeEventListener('touchend', end);
			removeEventListener('touchcancel', end);
		};
	});
</script>

{#if onTab}
	<button class="sr-only ptrbtn" type="button" onclick={() => run()}>Refresh</button>
	{#if pull > 0 || spin}
		<div
			class="ptr"
			class:spin
			style:translate="0 {spin ? LINE * 0.75 : pull * 0.75}px"
			style:rotate="{spin ? 0 : pull * 3}deg"
			role="status"
			aria-label={spin ? 'Refreshing' : pull >= LINE ? 'Let go to refresh' : 'Pull to refresh'}
		>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
				><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg
			>
		</div>
	{/if}
{/if}

<style>
	.ptrbtn {
		display: none;
		/* stays 1 px: the phone 48 dp button rule must not grow it */
		width: 1px !important;
		height: 1px !important;
		min-width: 0 !important;
		min-height: 0 !important;
		padding: 0 !important;
		border: 0 !important;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.ptrbtn {
			display: block;
		}
	}
	.ptr {
		position: fixed;
		top: calc(8px + env(safe-area-inset-top));
		left: 50%;
		margin-left: -20px;
		z-index: 45;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-btn);
		border: 1.5px solid var(--card-edge);
		pointer-events: none;
	}
	.spin svg {
		animation: ptr 0.8s linear infinite;
	}
	@keyframes ptr {
		to {
			rotate: 360deg;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spin svg {
			animation: none;
		}
	}
</style>
