<!-- Centre peek: blurred backdrop, panel grows out of the click point. Close = Esc, backdrop, ×, Back. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import ItemView from './ItemView.svelte';
	import { calendarChanged } from '$lib/client/bus.svelte';

	let { id, origin, onclose }: { id: string; origin?: { x: number; y: number }; onclose: () => void } =
		$props();

	let panel: HTMLDivElement | undefined = $state();
	let opener: Element | null = null;

	// grow from the click point
	function grow(node: HTMLElement, { duration = 220 }: { duration?: number } = {}) {
		const r = node.getBoundingClientRect();
		const ox = origin ? origin.x - r.left : r.width / 2;
		const oy = origin ? origin.y - r.top : r.height / 3;
		node.style.transformOrigin = `${ox}px ${oy}px`;
		return {
			duration,
			easing: cubicOut,
			css: (t: number) => `opacity:${Math.min(1, t * 1.6)};transform:scale(${0.55 + 0.45 * t})`,
		};
	}

	onMount(() => {
		opener = document.activeElement;
		panel?.focus();
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
			if (opener instanceof HTMLElement) opener.focus();
		};
	});
</script>

<div class="scrim" transition:fade={{ duration: 180 }}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="hit" onclick={onclose}></div>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-label="Item"
		tabindex="-1"
		bind:this={panel}
		in:grow
		out:grow={{ duration: 150 }}
	>
		{#key id}<ItemView
				{id}
				peek
				{onclose}
				onchanged={calendarChanged}
				ondeleted={() => {
					calendarChanged();
					onclose();
				}}
			/>{/key}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: var(--scrim);
		/* via a var: the CSS minifier otherwise keeps only the -webkit- form (Firefox needs the plain one) */
		--peek-blur: blur(8px);
		backdrop-filter: var(--peek-blur);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 4vh 24px;
		overflow-y: auto;
	}
	.hit {
		position: fixed;
		inset: 0;
	}
	.panel {
		position: relative;
		width: min(1180px, 100%);
		min-height: 80vh;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: 0 24px 64px var(--shadow);
		padding: 18px 24px 24px;
		outline: none;
	}
</style>
