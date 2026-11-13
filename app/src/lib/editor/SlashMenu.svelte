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
	<div class="keys" aria-hidden="true">↑↓ move · Enter insert · Esc cancel</div>
</div>

<style>
	.slash {
		position: fixed;
		z-index: 95;
		width: 300px;
		max-width: calc(100vw - 24px);
		max-height: 340px;
		overflow: auto;
		background: var(--card);
		color: var(--ink);
		border: 1.5px solid var(--border);
		border-radius: 12px;
		padding: 6px;
		box-shadow: -4px 4px 0 var(--accent);
	}
	[role='option'] {
		display: flex;
		flex-direction: column;
		padding: 7px 8px;
		border-radius: 8px;
		cursor: pointer;
		min-height: 24px;
	}
	[role='option'] b {
		font-size: 14px;
		font-weight: 600;
	}
	[role='option'] span {
		color: var(--quiet);
		font-size: 12px;
	}
	[aria-selected='true'] {
		background: var(--pill-card);
		color: var(--pill-ink);
	}
	[aria-selected='true'] span {
		color: var(--pill-ink);
	}
	.none,
	.keys {
		padding: 6px 8px 2px;
		font-size: 11px;
		color: var(--quiet);
	}
	.none {
		font-size: 13px;
	}
</style>
