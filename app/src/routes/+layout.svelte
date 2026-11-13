<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import { closePeek, peek } from '$lib/client/peek.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	import MobileBar from '$lib/components/MobileBar.svelte';
	import MobileAdd from '$lib/components/MobileAdd.svelte';
	import ItemPeek from '$lib/components/ItemPeek.svelte';
	import { browser } from '$app/environment';
	import { initHours } from '$lib/client/hours.svelte';
	import { initTypes } from '$lib/client/itemtypes.svelte';
	import { onUndoKey } from '$lib/client/undo.svelte';
	import { watchInbox } from '$lib/client/inbox';
	import { onMount } from 'svelte';
	let { data, children } = $props();
	// svelte-ignore state_referenced_locally
	if (browser) initHours(data.hours);
	// browser only (effects never run in SSR): module state on the server would be shared between users
	$effect.pre(() => initTypes(data.types, data.user?.hiddenTypes ?? []));
	onMount(() => (data.user ? watchInbox() : undefined));
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
{#if data.user}
	<MobileBar />
	<MobileAdd />
{/if}
<UndoToast />
<svelte:window onkeydown={(e) => data.user && onUndoKey(e)} />
