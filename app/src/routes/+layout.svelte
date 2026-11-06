<script lang="ts">
	import '../app.css';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import UndoToast from '$lib/components/UndoToast.svelte';
	let { data, children } = $props();
</script>

{#if data.user}
	<AppHeader user={data.user} courses={data.courses} />
{/if}
{@render children()}
<UndoToast />
