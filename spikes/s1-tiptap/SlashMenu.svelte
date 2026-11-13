<script>
	let { s } = $props();
</script>

<div class="slash" role="listbox" style:left="{s.x}px" style:top="{s.y}px">
	{#each s.items as item, i (item.title)}
		<div role="option" aria-selected={i === s.index}>{item.title}</div>
	{:else}
		<div>No match</div>
	{/each}
</div>
