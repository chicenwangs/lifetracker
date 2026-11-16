<!-- One phone bottom sheet (Mobile overhaul G10, #92): drag handle (tap cycles half / full), handle swipe to close,
     scrim tap, visible Close, scrolls inside, Back closes it. Desktop = the old centre panel, unchanged. -->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';

	let {
		onclose,
		label,
		labelledby,
		origin,
		intro = 'rise',
		children,
	}: {
		onclose: () => void;
		label?: string;
		labelledby?: string;
		origin?: { x: number; y: number };
		intro?: 'rise' | 'grow';
		children: Snippet;
	} = $props();

	let panel: HTMLDivElement | undefined = $state();
	let height = $state<'half' | 'full'>('half');
	let dragging = $state(false);
	let dragY = $state(0);
	let startY = 0;
	let didDrag = false;
	// read before children mount: an autofocus input inside would otherwise be taken as the opener
	const opener = typeof document === 'undefined' ? null : document.activeElement;

	// desktop peek grows from the click point; the phone sheet rises from the bottom (CSS)
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
		if (!panel?.contains(document.activeElement)) panel?.focus();
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
			if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
		};
	});

	function toggle() {
		if (didDrag) return void (didDrag = false);
		height = height === 'half' ? 'full' : 'half';
	}
	function down(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		dragging = true;
		didDrag = false;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		const dy = e.clientY - startY;
		if (Math.abs(dy) > 6) didDrag = true;
		dragY = Math.max(-60, dy); // follows the finger; up is capped
	}
	function up(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const dy = e.clientY - startY;
		dragY = 0;
		if (dy < -40) height = 'full';
		else if (dy > 140) {
			if (height === 'full') height = 'half';
			else onclose();
		}
		const el = e.currentTarget as HTMLElement;
		if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
	}
</script>

<div class="scrim" transition:fade={{ duration: 180 }}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="hit" onclick={onclose}></div>
	<div
		class="panel"
		class:full={height === 'full'}
		class:dragging
		role="dialog"
		aria-modal="true"
		aria-label={label}
		aria-labelledby={labelledby}
		tabindex="-1"
		bind:this={panel}
		style:transform={dragY ? `translateY(${dragY}px)` : ''}
		in:grow={intro === 'grow' ? { duration: 220 } : { duration: 0 }}
		out:grow={intro === 'grow' ? { duration: 150 } : { duration: 0 }}
	>
		<div class="head">
			<button
				class="grab"
				type="button"
				aria-label={height === 'half' ? 'Expand sheet' : 'Collapse sheet'}
				aria-expanded={height === 'full'}
				title={height === 'half' ? 'Expand' : 'Collapse'}
				onclick={toggle}
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
			>
				<span class="bar" aria-hidden="true"></span>
			</button>
			<button class="x" type="button" aria-label="Close" onclick={onclose}>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg
				>
			</button>
		</div>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50; /* desktop peek layer, as before #92 */
		background: var(--scrim);
		/* via a var: the CSS minifier otherwise keeps only the -webkit- form (Firefox needs the plain one) */
		--sheet-blur: blur(8px);
		backdrop-filter: var(--sheet-blur);
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
		border-radius: 16px;
		padding: 18px 24px 24px;
		outline: none;
		border: 1.5px solid var(--card-edge);
		box-shadow: -8px 8px 0 var(--accent);
	}
	.head {
		display: none;
	}
	/* phone: one shared bottom sheet, half then full (G10) */
	@media (max-width: 699px) {
		.scrim {
			z-index: 80;
			padding: 0;
			align-items: flex-end;
			overflow: hidden;
			background: rgb(0 0 0 / 0.35);
			backdrop-filter: none;
		}
		.panel {
			width: 100%;
			max-width: 640px;
			min-height: 0;
			height: 50dvh;
			border-radius: 16px 16px 0 0;
			padding: 0 16px calc(16px + env(safe-area-inset-bottom));
			box-shadow: none;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			animation: lt-rise 200ms var(--ease) both;
			transition:
				height 220ms var(--ease),
				transform 180ms var(--ease);
		}
		.panel.full {
			height: 92dvh;
		}
		.panel.dragging {
			transition: none;
		}
		.head {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			flex: 0 0 48px;
			user-select: none;
			touch-action: none;
		}
		.grab {
			width: 100%;
			height: 48px;
			border: 0;
			padding: 0;
			background: transparent;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: grab;
			touch-action: none;
		}
		.grab:active {
			cursor: grabbing;
		}
		.bar {
			width: 40px;
			height: 4px;
			border-radius: 2px;
			background: var(--quiet);
			opacity: 0.55;
		}
		.x {
			position: absolute;
			right: -6px;
			top: 0;
			width: 48px;
			height: 48px;
			border: 0;
			border-radius: 24px;
			padding: 0;
			background: transparent;
			color: var(--ink);
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		}
		.x:active {
			background: var(--hover, rgb(0 0 0 / 0.06));
		}
		.body {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
			display: flex;
			flex-direction: column;
			gap: 12px;
			padding: 4px 0 0;
		}
	}
</style>
