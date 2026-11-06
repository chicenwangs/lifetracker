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
		background: var(--card);
		color: var(--ink);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.sq.done {
		background: var(--ink);
		color: var(--on-ink);
	}
	.sq:disabled {
		cursor: default;
	}
</style>
