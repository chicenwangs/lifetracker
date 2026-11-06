<!-- Full page for an item (direct link / reload). Same view as the centre peek. -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ItemView from '$lib/components/ItemView.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.view.item.title} · Life Tracker</title></svelte:head>

<main class="wrap card">
	{#key data.view.item.id}
		<ItemView
			id={data.view.item.id}
			initial={data.view}
			onchanged={() => invalidateAll()}
			ondeleted={(parent) => goto(parent ? `/item/${parent}` : `/?d=${data.view.item.date ?? ''}`)}
		/>
	{/key}
</main>

<style>
	.wrap {
		margin: 20px auto;
		max-width: 1180px;
		width: calc(100% - 48px);
		padding: 18px 24px 24px;
	}
</style>
