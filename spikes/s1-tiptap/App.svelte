<script>
	import Editor from './Editor.svelte';

	// `show` mounts/unmounts the editor (leak test); `tick` re-renders around and into it (selection test)
	let show = $state(true);
	let tick = $state(0);
	let json = $state(null);
	Object.assign(window, {
		__toggle: () => (show = !show),
		__bump: () => tick++,
		__json: () => $state.snapshot(json),
	});
</script>

<p id="status">tick {tick} · {json ? 'edited' : 'clean'}</p>
{#if show}
	<Editor {tick} onchange={(j) => (json = j)} />
{/if}
