<!-- FR-H3. Square: empty = todo, ▶ = doing, filled + ✓ = done. Click / Space / Enter cycles. -->
<script lang="ts">
	import type { Status } from '$lib/types';
	let {
		status,
		size = 16,
		ink = 'currentColor',
		disabled = false,
		oncycle,
	}: { status: Status; size?: number; ink?: string; disabled?: boolean; oncycle: () => void } = $props();

	const LABEL: Record<Status, string> = {
		todo: 'Not started. Click to start',
		doing: 'In progress. Click to complete',
		done: 'Completed. Click to reset',
	};
	const icon = $derived(Math.round(size * 0.62));
</script>

<button
	type="button"
	class="sq"
	class:done={status === 'done'}
	aria-label={LABEL[status]}
	title={LABEL[status]}
	{disabled}
	style:--sz="{size}px"
	style:--ink={ink}
	onclick={(e) => {
		e.preventDefault();
		e.stopPropagation();
		navigator.vibrate?.(8); // tiny tap on phones that allow it (app + Android Chrome); ignored elsewhere
		oncycle();
	}}
	onpointerdown={(e) => e.stopPropagation()}
	onmousedown={(e) => e.stopPropagation()}
>
	{#if status === 'doing'}
		<svg width={icon} height={icon} viewBox="0 0 10 10" aria-hidden="true"
			><path d="M2.5 1.5l6 3.5-6 3.5z" fill="currentColor" /></svg
		>
	{:else if status === 'done'}
		<svg width={icon} height={icon} viewBox="0 0 10 10" aria-hidden="true"
			><path d="M1.5 5.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg
		>
	{/if}
</button>

<style>
	.sq {
		flex: none;
		width: var(--sz);
		height: var(--sz);
		padding: 0;
		border-radius: 4px;
		border: 1.5px solid var(--ink);
		color: var(--ink);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		background: transparent;
	}
	/* 24×24 hit area (WCAG 2.5.8), drawn box stays --sz */
	.sq {
		position: relative;
	}
	.sq::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: max(24px, 100%);
		height: max(24px, 100%);
		translate: -50% -50%;
	}
	/* fill = the ink; only the tick takes the "on" colour. Setting color on the button itself made
	   currentColor (the default ink) turn into the on-colour too: fill, border and tick all vanished. */
	.sq.done {
		background: var(--ink);
	}
	.sq.done svg {
		color: var(--sq-on, var(--on-ink));
	}
	.sq:disabled {
		cursor: default;
	}

	.sq {
		transition: transform var(--t-fast) var(--ease);
	}
	.sq:not(:disabled):hover {
		transform: scale(1.12);
	}
	.sq.done {
		animation: lt-done 300ms var(--ease);
	}
	/* follow-through: the tick draws itself just after the box fills */
	.sq.done path {
		stroke-dasharray: 10;
		animation: tick 220ms 90ms var(--ease) both;
	}
	@keyframes tick {
		from {
			stroke-dashoffset: 10;
		}
	}
	@media (pointer: coarse) {
		.sq::after {
			width: max(40px, 100%);
			height: max(40px, 100%);
		}
	}
</style>
