<!-- v3.3 PR 9: a from-completion series shows only its next date; the row says why. -->
<script lang="ts">
	let { item }: { item?: { repeatFromCompletion?: boolean } | null } = $props();
</script>

{#if item?.repeatFromCompletion}
	<span class="rep" aria-label="Repeats from completion" title="Repeats from completion">↻✓</span>
{/if}

<style>
	.rep {
		flex: none;
		font-size: 11px;
		line-height: 1;
		color: var(--quiet);
		letter-spacing: -1px;
	}
</style>
