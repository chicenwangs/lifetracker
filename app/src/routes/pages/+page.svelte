<!-- Pages index. Desktop: pick a page on the left. Phone: the tree above is "All pages". -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { post } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';
	let { data } = $props();
	async function create() {
		try {
			const r = await post<{ page: { id: string } }>('/api/pages', { parentId: null });
			await invalidateAll();
			await goto(`/pages/${r.page.id}`);
		} catch (e) {
			showError(e);
		}
	}
</script>

<svelte:head><title>Pages · Life Tracker</title></svelte:head>

<div class="card panel empty" class:has={data.tree.length}>
	<h1>Pages</h1>
	{#if data.tree.length}
		<p class="muted">Open a page from the list, or start a new one.</p>
	{:else}
		<p class="muted">Your second brain starts here: notes that grow, link to each other and nest.</p>
	{/if}
	<button class="btn primary" type="button" onclick={create}>New page</button>
	<p class="hint">Tip: Ctrl+K searches pages, notes and planner items.</p>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	/* phone: the tree above is the screen and has its own New page */
	@media (max-width: 699px) {
		.has {
			display: none;
		}
	}
</style>
