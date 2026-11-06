<!--
  Edge of a timeline that rolls hours away / back. Drag (row-resize cursor, like a sidebar splitter) in whole hours.
  Top edge: drag down = roll early hours up (grid stays top-justified). Bottom edge: drag up = roll late hours.
  Click a rolled strip = show those hours again. Keyboard: arrows move the edge 1 h, Enter unrolls.
-->
<script lang="ts">
	import { hoursState, setHours } from '$lib/client/hours.svelte';
	import { pad2 } from '$lib/hours';

	let {
		edge,
		hourPx,
		hidden = [],
		pos,
	}: {
		edge: 'top' | 'bottom';
		/** current px per hour, for drag maths */
		hourPx: number;
		/** labels of blocks fully inside the rolled hours */
		hidden?: string[];
		/** absolute placement (week overlay); omit = in flow */
		pos?: { top: number; left: number; width: number; height: number };
	} = $props();

	const rolled = $derived(edge === 'top' ? hoursState.start > 0 : hoursState.end < 24);
	const range = $derived(
		edge === 'top' ? `00:00 – ${pad2(hoursState.start)}:00` : `${pad2(hoursState.end)}:00 – 24:00`,
	);
	let g: { y0: number; s0: number; e0: number; moved: boolean } | null = null;
	let dragging = $state(false);

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		g = { y0: e.clientY, s0: hoursState.start, e0: hoursState.end, moved: false };
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!g) return;
		const dy = e.clientY - g.y0;
		if (Math.abs(dy) > 4) g.moved = true;
		if (!g.moved) return;
		const steps = Math.round(dy / Math.max(8, hourPx));
		if (edge === 'top') setHours(g.s0 + steps, g.e0, 'start');
		else setHours(g.s0, g.e0 + steps, 'end');
	}
	function up() {
		if (!g) return;
		const clicked = !g.moved;
		g = null;
		dragging = false;
		if (clicked && rolled) unroll();
		else setHours(hoursState.start, hoursState.end, edge === 'top' ? 'start' : 'end', true);
	}
	function unroll() {
		if (edge === 'top') setHours(0, hoursState.end, 'start', true);
		else setHours(hoursState.start, 24, 'end', true);
	}
	function key(e: KeyboardEvent) {
		const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
		if (d) {
			e.preventDefault();
			if (edge === 'top') setHours(hoursState.start + d, hoursState.end, 'start', true);
			else setHours(hoursState.start, hoursState.end + d, 'end', true);
		} else if (e.key === 'Enter' && rolled) {
			e.preventDefault();
			unroll();
		}
	}
</script>

<!-- a focusable separator is a valid ARIA widget (window splitter pattern) -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="rh {edge}"
	class:rolled
	class:dragging
	class:abs={!!pos}
	style:top={pos ? `${pos.top}px` : undefined}
	style:left={pos ? `${pos.left}px` : undefined}
	style:width={pos ? `${pos.width}px` : undefined}
	style:height={pos ? `${pos.height}px` : undefined}
	role="separator"
	aria-orientation="horizontal"
	aria-valuemin={0}
	aria-valuemax={24}
	aria-valuenow={edge === 'top' ? hoursState.start : hoursState.end}
	aria-label={edge === 'top'
		? `Timeline starts at ${pad2(hoursState.start)}:00. Drag or arrow keys to roll early hours${rolled ? ', Enter shows them' : ''}`
		: `Timeline ends at ${pad2(hoursState.end)}:00. Drag or arrow keys to roll late hours${rolled ? ', Enter shows them' : ''}`}
	title={rolled ? `${range} rolled up · click to show, drag to adjust` : 'Drag to roll hours away'}
	tabindex="0"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onkeydown={key}
>
	{#if rolled}
		<span class="lbl">
			<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
				><path
					d={edge === 'top' ? 'M2 3.5l3 3 3-3' : 'M2 6.5l3-3 3 3'}
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
				/></svg
			>
			{range}
			{#if hidden.length}<b>· {hidden.length} hidden:</b>
				<span class="names">{hidden.join(', ')}</span>{/if}
		</span>
	{:else}
		<span class="grip" aria-hidden="true"></span>
	{/if}
</div>

<style>
	.rh {
		position: relative;
		height: 14px;
		cursor: row-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		user-select: none;
		touch-action: none;
		z-index: 8;
		flex: none;
		outline-offset: -2px;
	}
	.rh.abs {
		position: absolute;
	}
	.rh.rolled {
		height: 22px;
		background: repeating-linear-gradient(135deg, var(--rule) 0 4px, transparent 4px 8px);
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
	}
	.grip {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		opacity: 0;
		transition: opacity 0.12s;
	}
	.rh:hover .grip,
	.rh:focus-visible .grip,
	.rh.dragging .grip {
		opacity: 1;
	}
	.rh:hover,
	.rh.dragging {
		background-color: color-mix(in srgb, var(--hover) 70%, transparent);
	}
	.rh.dragging {
		box-shadow: inset 0 0 0 1px var(--ink);
	}
	.lbl {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		max-width: calc(100% - 16px);
		font-size: 11px;
		color: var(--quiet);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0 8px;
		line-height: 16px;
		white-space: nowrap;
		overflow: hidden;
	}
	.lbl b {
		font-weight: 600;
		color: var(--ink);
	}
	.names {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
