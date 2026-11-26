<!-- Pages index. Desktop: pick a page on the left. Phone: the tree above is "All pages". -->
<script lang="ts">
	import { createPage } from '$lib/client/newPage';
	let { data } = $props();
	const create = () => createPage(null);
</script>

<svelte:head><title>Pages · Life Tracker</title></svelte:head>

<div class="card panel empty" class:has={data.tree.length}>
	<h1>Pages</h1>
	{#if data.tree.length}
		<p class="muted">Open a page from the list, or start a new one.</p>
	{:else}
		<p class="muted">Your second brain starts here: notes that grow, link to each other and nest.</p>
	{/if}
	<button class="btn primary newpage" type="button" onclick={create}>New page</button>
	<p class="hint">Tip: Ctrl+K searches pages, notes and planner items.</p>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	/* the Ctrl+K tip is a key hint: fine pointers only (D-V4-03) */
	.hint {
		display: none;
	}
	@media (pointer: fine) {
		.hint {
			display: block;
		}
	}
	/* phone: the tree above is the screen and has its own New page */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.has,
		.newpage /* the bar's + (#93) */ {
			display: none;
		}
	}
</style>
