<!-- Pages Archive (PG-ARCHIVE): search, sort, Restore per row, "Was in"; 90-day suggestions, nothing pre-ticked. -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import type { UndoRef } from '$lib/types';

	let { data } = $props();
	let q = $state('');
	let sort = $state<'archived' | 'opened' | 'links'>('archived');
	const rows = $derived(
		data.archived
			.filter((r) => (r.title || 'Untitled').toLowerCase().includes(q.toLowerCase()))
			.sort((a, b) =>
				sort === 'links' ? b.links - a.links : sort === 'opened' ? (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '') : b.archivedAt.localeCompare(a.archivedAt),
			),
	); // prettier-ignore
	let picked = $state<string[]>([]);
	let dismissed = $state(false);

	async function restore(id: string) {
		try {
			const r = await post<{ restored: number }>(`/api/pages/${id}/restore`);
			await invalidateAll();
			showToast(`Restored ${r.restored} page${r.restored === 1 ? '' : 's'}`);
		} catch (e) {
			showError(e);
		}
	}
	async function archiveSelected() {
		const ids = [...picked];
		try {
			const refs: UndoRef[] = [];
			for (const id of ids) refs.push((await post<{ undo: UndoRef }>(`/api/pages/${id}/archive`)).undo);
			picked = [];
			await invalidateAll();
			showToast(`Archived ${ids.length}`, {
				undo: async () => {
					for (const u of refs.reverse()) await undoLast(u.id);
					await invalidateAll();
				},
			});
		} catch (e) {
			showError(e);
			await invalidateAll();
		}
	}
	const day = (z: string | null) => (z ? new Date(z).toLocaleDateString() : 'never');
</script>

<svelte:head><title>Pages archive · Life Tracker</title></svelte:head>

{#if data.suggestions.length && !dismissed}
	<section class="card panel sugg" aria-labelledby="sg-h">
		<div class="hd">
			<h2 id="sg-h">Not opened in 90+ days</h2>
			<button class="btn sm ghost" type="button" onclick={() => (dismissed = true)}>Dismiss</button>
		</div>
		<p class="hint">
			Archive keeps them (graph and links still work) but out of your way. Nothing is archived until you
			click.
		</p>
		<button
			class="btn sm"
			type="button"
			onclick={() =>
				(picked = picked.length === data.suggestions.length ? [] : data.suggestions.map((s) => s.id))}
			>{picked.length === data.suggestions.length ? 'Select none' : 'Select all'}</button
		>
		{#each data.suggestions as s (s.id)}
			<label class="opt"
				><input
					type="checkbox"
					checked={picked.includes(s.id)}
					onchange={() =>
						(picked = picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
				/>
				{s.title || 'Untitled'} <span class="hint">last opened {day(s.lastOpenedAt)}</span></label
			>
		{/each}
		<button class="btn sm primary" type="button" disabled={!picked.length} onclick={archiveSelected}
			>Archive selected</button
		>
	</section>
{/if}

<section class="card panel">
	<h1>Archive</h1>
	<div class="bar">
		<input type="search" placeholder="Search archive" aria-label="Search archive" bind:value={q} />
		<label
			>Sort <select bind:value={sort}
				><option value="archived">Archived date</option><option value="opened">Last opened</option><option
					value="links">Most linked</option
				></select
			></label
		>
	</div>
	{#each rows as r (r.id)}
		<div class="row">
			<a href="/pages/{r.id}"><b>{r.title || 'Untitled'}</b></a>
			<span class="hint"
				>{r.wasIn ? `Was in ${r.wasIn} · ` : ''}archived {day(r.archivedAt)} · {r.links} links</span
			>
			<button class="btn sm" type="button" onclick={() => restore(r.id)}>Restore</button>
		</div>
	{:else}<p class="hint">
			{q
				? 'No archived page matches.'
				: 'Nothing archived. Archived pages leave the sidebar but stay in the graph.'}
		</p>{/each}
</section>

<style>
	.sugg {
		margin-bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}
	.hd {
		display: flex;
		width: 100%;
		justify-content: space-between;
		align-items: center;
	}
	.hd h2 {
		margin: 0;
	}
	.opt {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.bar {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 8px;
	}
	.bar input {
		flex: 1;
		min-height: 32px;
		padding: 0 10px;
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
		padding: 8px 0;
		border-top: 1px solid var(--rule);
		flex-wrap: wrap;
	}
	.row a {
		color: var(--ink);
	}
	.row .hint {
		flex: 1;
	}
</style>
