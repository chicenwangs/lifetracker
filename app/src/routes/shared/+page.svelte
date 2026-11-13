<!-- Shared with me: pages open in the page view; notes open in the note editor (text only if I can edit). -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import KeepNote from '$lib/components/KeepNote.svelte';
	import type { NoteDTO } from '$lib/types';

	let { data } = $props();
	let open = $state<{ note: NoteDTO; permission: 'view' | 'edit' } | null>(null);
	const excerpt = (n: NoteDTO) =>
		n.type === 'checklist' ? n.items.slice(0, 4).map((i) => (i.checked ? '☑ ' : '☐ ') + i.text).join('\n') : n.body.slice(0, 200); // prettier-ignore
</script>

<svelte:head><title>Shared with me · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Shared with me</h1>
	<h2>Pages</h2>
	<ul class="list">
		{#each data.pages as p (p.id)}
			<li>
				<a href="/pages/{p.id}">{p.icon ?? ''} {p.title || 'Untitled'}</a>
				<span class="hint">from {p.owner} · {p.permission === 'edit' ? 'can edit' : 'view only'}</span>
			</li>
		{:else}<li class="hint">No pages shared with you.</li>{/each}
	</ul>
	<h2>Notes</h2>
	<div class="notes">
		{#each data.notes as n (n.id)}
			<button
				class="note card"
				type="button"
				style:background={n.note.color ?? undefined}
				onclick={() => (open = { note: n.note, permission: n.permission })}
			>
				<strong>{n.note.title}</strong>
				<span class="body">{excerpt(n.note)}</span>
				<span class="hint">from {n.owner} · {n.permission === 'edit' ? 'can edit' : 'view only'}</span>
			</button>
		{:else}<p class="hint">No notes shared with you.</p>{/each}
	</div>
</section>

{#if open}
	<KeepNote
		note={open.note}
		labels={[]}
		binders={[]}
		colors={[]}
		shared={open.permission}
		onclose={() => (open = null)}
		onchanged={() => void invalidateAll()}
	/>
{/if}

<style>
	h2 {
		font-size: 15px;
		margin: 18px 0 6px;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.list li {
		display: flex;
		gap: 10px;
		align-items: baseline;
		min-height: 32px;
	}
	.notes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 10px;
	}
	.note {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: left;
		padding: 12px;
		font: inherit;
		color: #00003d;
		cursor: pointer;
		border: 1px solid var(--rule);
	}
	.note:not([style]) {
		color: var(--ink);
	}
	.body {
		white-space: pre-line;
		font-size: 13px;
	}
</style>
