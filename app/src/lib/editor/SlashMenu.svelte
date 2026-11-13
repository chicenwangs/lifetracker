<!-- "/" menu popup. Driven by one $state object from the Slash extension; click or Enter picks. -->
<script lang="ts">
	import type { SlashItem } from './extensions.svelte';
	let {
		s,
		onpick,
	}: { s: { items: SlashItem[]; index: number; x: number; y: number }; onpick: (i: SlashItem) => void } =
		$props();
</script>

<div class="slash" role="listbox" aria-label="Insert block" style:left="{s.x}px" style:top="{s.y + 4}px">
	{#each s.items as item, i (item.title)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			role="option"
			tabindex="-1"
			aria-selected={i === s.index}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => onpick(item)}
		>
			<b>{item.title}</b>{#if item.hint}<span>{item.hint}</span>{/if}
		</div>
	{:else}
		<div class="none">No results</div>
	{/each}
</div>

<style>
	.slash {
		position: fixed;
		z-index: 95;
		min-width: 220px;
		max-height: 300px;
		overflow: auto;
		background: var(--card);
		color: var(--ink);
		border: 1.5px solid var(--border);
		border-radius: 10px;
		padding: 4px;
		box-shadow: var(--shadow-btn);
		font-size: 13px;
	}
	[role='option'] {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 10px;
		border-radius: 6px;
		cursor: pointer;
		min-height: 24px;
	}
	[role='option'] span {
		color: var(--muted);
		font-size: 11px;
	}
	[aria-selected='true'] {
		background: var(--accent);
		color: #00003d;
	}
	.none {
		padding: 6px 10px;
		color: var(--muted);
	}
</style>
