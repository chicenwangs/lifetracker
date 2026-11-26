<!-- Row actions on phone (#96): the tap path (and TalkBack path) for every row gesture, in the shared sheet. -->
<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';

	let {
		title,
		actions,
		hint,
		onclose,
	}: {
		title: string;
		actions: { label: string; danger?: boolean; run: () => unknown }[];
		/** optional line under the title (empty states) */
		hint?: string;
		onclose: () => void;
	} = $props();
</script>

<BottomSheet label="Actions for {title}" {onclose}>
	<h2>{title}</h2>
	{#if hint}<p class="hint">{hint}</p>{/if}
	{#each actions as a (a.label)}
		<button
			class="act"
			class:danger={a.danger}
			type="button"
			onclick={() => {
				onclose();
				void a.run();
			}}>{a.label}</button
		>
	{/each}
</BottomSheet>

<style>
	h2 {
		margin: 0 4px 4px;
		font-size: 16px;
	}
	.act {
		display: flex;
		align-items: center;
		min-height: 52px;
		padding: 0 4px;
		border: 0;
		border-bottom: 1px solid var(--rule);
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.danger {
		color: var(--danger);
	}
	.hint {
		margin: 0 4px 8px;
	}
</style>
