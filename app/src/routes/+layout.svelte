<script lang="ts">
	import '../app.css';
	import { closePeek, peek } from '$lib/client/peek.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import ItemPeek from '$lib/components/ItemPeek.svelte';
	let { data, children } = $props();
</script>

{#if data.user}
	<AppHeader user={data.user} courses={data.courses} />
{/if}
{@render children()}
{#if data.user && peek.id}
	{#key peek.id}
		<ItemPeek id={peek.id} origin={peek.origin ?? undefined} onclose={closePeek} />
	{/key}
{/if}
<UndoToast />
