<script lang="ts">
	import '../app.css';
	import { closePeek, peek } from '$lib/client/peek.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import ItemPeek from '$lib/components/ItemPeek.svelte';
	import { browser } from '$app/environment';
	import { initHours } from '$lib/client/hours.svelte';
	let { data, children } = $props();
	// svelte-ignore state_referenced_locally
	if (browser) initHours(data.hours);
</script>

{#if data.user}
	<AppHeader user={data.user} />
{/if}
{@render children()}
{#if data.user && peek.id}
	{#key peek.id}
		<ItemPeek id={peek.id} origin={peek.origin ?? undefined} onclose={closePeek} />
	{/key}
{/if}
<UndoToast />
