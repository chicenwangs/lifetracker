<!-- Pages › Shared with me: same card + rows as Archive. Notes shared with me live in Keep › Shared with me. -->
<script lang="ts">
	let { data } = $props();
	let q = $state('');
	const rows = $derived(
		data.shared.filter((r) => (r.title || 'Untitled').toLowerCase().includes(q.trim().toLowerCase())),
	);
</script>

<svelte:head><title>Shared with me · Pages · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Shared with me</h1>
	<p class="hint">
		Pages other people shared with you. Only these open for you, not the rest of their pages. Notes shared
		with you are in <a href="/keep?scope=shared">Keep › Shared with me</a>{data.notes
			? ` (${data.notes})`
			: ''}.
	</p>
	{#if data.shared.length}
		<input type="search" placeholder="Search shared pages" aria-label="Search shared pages" bind:value={q} />
	{/if}
	{#each rows as r (r.id)}
		<div class="row">
			<a href="/pages/{r.id}"><b>{r.icon ? `${r.icon} ` : ''}{r.title || 'Untitled'}</b></a>
			<span class="hint">from {r.owner}</span>
			<span class="chip" class:edit={r.permission === 'edit'}
				>{r.permission === 'edit' ? 'Can edit' : 'View only'}</span
			>
		</div>
	{:else}<p class="hint">
			{q.trim()
				? 'No shared page matches.'
				: 'No pages shared with you yet. When someone shares one, it shows here.'}
		</p>{/each}
</section>

<style>
	.hint a {
		text-decoration: underline; /* a link inside text must not rely on colour alone */
	}
	input {
		width: 100%;
		box-sizing: border-box;
		min-height: 36px;
		margin: 12px 0 8px;
		padding: 0 12px;
		font: inherit;
		border-radius: 999px;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--ink);
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 44px;
		padding: 6px 0;
		border-top: 1px solid var(--rule);
		flex-wrap: wrap;
	}
	.row a {
		flex: 1;
		min-width: 0;
		color: var(--ink);
	}
	.chip {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 10px;
		border-radius: 999px;
		border: 1.5px solid var(--border);
	}
	.chip.edit {
		background: var(--pill-card);
		color: var(--pill-ink);
	}
</style>
