<!-- Ctrl+K / Cmd+K (UX-AUDIT #9, UX-4): search pages, notes, planner items + jump to actions. Mine only. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { get, post } from '$lib/client/api';
	import { openItem } from '$lib/client/peek.svelte';
	import { showError } from '$lib/client/toast.svelte';
	import { tick } from 'svelte';

	interface Row {
		group: 'Actions' | 'Pages' | 'Notes' | 'Planner';
		label: string;
		sub?: string;
		run: () => void | Promise<void>;
	}
	let open = $state(false);
	let q = $state('');
	let sel = $state(0);
	let includeArchived = $state(false);
	let results = $state<Row[]>([]);
	let input: HTMLInputElement | undefined = $state();

	const ACTIONS: Row[] = [
		{ group: 'Actions', label: 'Quick add', sub: 'N', run: () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' })) },
		{ group: 'Actions', label: 'New note', run: () => goto('/keep?new=1') },
		{ group: 'Actions', label: 'New page', run: async () => { const r = await post<{ page: { id: string } }>('/api/pages', { parentId: null }); await goto(`/pages/${r.page.id}`); } },
		{ group: 'Actions', label: 'Go to Home', run: () => goto('/') },
		{ group: 'Actions', label: 'Go to Week', run: () => goto('/week') },
		{ group: 'Actions', label: 'Go to Keep', run: () => goto('/keep') },
		{ group: 'Actions', label: 'Go to Pages', run: () => goto('/pages') },
		{ group: 'Actions', label: 'Pages archive', run: () => goto('/pages/archive') },
		{ group: 'Actions', label: 'Knowledge graph', run: () => goto('/pages/graph') },
		{ group: 'Actions', label: 'Settings', run: () => goto('/settings/preferences') },
	]; // prettier-ignore

	export async function show() {
		open = true;
		q = '';
		sel = 0;
		results = ACTIONS;
		await tick();
		input?.focus();
	}
	let seq = 0;
	let t: ReturnType<typeof setTimeout> | null = null;
	function onInput() {
		sel = 0;
		if (t) clearTimeout(t);
		t = setTimeout(run, 150);
	}
	async function run() {
		const n = ++seq;
		const term = q.trim();
		const acts = ACTIONS.filter((a) => a.label.toLowerCase().includes(term.toLowerCase()));
		if (!term) return void (results = ACTIONS);
		try {
			const r = await get<{ hits: { kind: 'page' | 'note'; id: string; title: string; snippet: string; archived: boolean }[]; items: { id: string; title: string; date: string | null }[] }>(
				`/api/search?q=${encodeURIComponent(term)}${includeArchived ? '&archived=1' : ''}`,
			); // prettier-ignore
			if (n !== seq) return;
			results = [
				...acts,
				...r.hits.filter((h) => h.kind === 'page').map((h): Row => ({ group: 'Pages', label: h.title || 'Untitled', sub: (h.archived ? 'archived · ' : '') + h.snippet, run: () => goto(`/pages/${h.id}`) })),
				...r.hits.filter((h) => h.kind === 'note').map((h): Row => ({ group: 'Notes', label: h.title || h.snippet || 'Note', sub: h.archived ? 'archived' : h.title ? h.snippet : '', run: () => goto(`/keep?${h.archived ? 'scope=archive&' : ''}note=${h.id}`) })),
				...r.items.map((i): Row => ({ group: 'Planner', label: i.title, sub: i.date ?? 'no date', run: () => openItem(i.id) })),
			]; // prettier-ignore
		} catch (e) {
			showError(e);
		}
	}
	async function pick(r: Row | undefined) {
		if (!r) return;
		open = false;
		try {
			await r.run();
		} catch (e) {
			showError(e);
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') return void (open = false);
		if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
		e.preventDefault();
		if (e.key === 'ArrowDown') sel = Math.min(results.length - 1, sel + 1);
		else if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1);
		else void pick(results[sel]);
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) {
			e.preventDefault(); // also inside text fields: browsers' own Ctrl+K is the address bar
			if (open) open = false;
			else void show();
		}
	}}
/>

{#if open}
	<div class="scrim" role="presentation" onclick={() => (open = false)}></div>
	<div class="pal card" role="dialog" aria-modal="true" aria-label="Search and go">
		<input
			bind:this={input}
			bind:value={q}
			oninput={onInput}
			onkeydown={onKey}
			placeholder="Search pages, notes, planner… or type an action"
			aria-label="Search"
			role="combobox"
			aria-expanded="true"
			aria-controls="cmdk-list"
			aria-activedescendant={results.length ? `cmdk-${sel}` : undefined}
		/>
		<label class="arch"
			><input type="checkbox" bind:checked={includeArchived} onchange={run} /> Include archived</label
		>
		<div id="cmdk-list" role="listbox" aria-label="Results">
			{#each results as r, i (i)}
				{#if i === 0 || results[i - 1]?.group !== r.group}<div class="grp">{r.group}</div>{/if}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					id="cmdk-{i}"
					role="option"
					tabindex="-1"
					aria-selected={i === sel}
					onmouseenter={() => (sel = i)}
					onclick={() => pick(r)}
				>
					<span class="l">{r.label}</span>{#if r.sub}<span class="s">{r.sub}</span>{/if}
				</div>
			{:else}<p class="hint">Nothing found{q ? ` for "${q}"` : ''}.</p>{/each}
		</div>
		<p class="hint keys">↑↓ move · Enter open · Esc close</p>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 96;
		background: var(--scrim, rgb(0 0 0 / 0.3));
	}
	.pal {
		position: fixed;
		top: 12vh;
		left: 50%;
		translate: -50% 0;
		z-index: 97;
		width: min(620px, 94vw);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		padding: 12px;
		gap: 6px;
	}
	.pal > input {
		min-height: 44px;
		padding: 0 14px;
		font: inherit;
		font-size: 16px;
		border-radius: 10px;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--ink);
	}
	.arch {
		font-size: 12px;
		display: flex;
		gap: 6px;
		align-items: center;
	}
	[role='listbox'] {
		overflow-y: auto;
	}
	.grp {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--muted);
		padding: 8px 8px 2px;
	}
	[role='option'] {
		display: flex;
		flex-direction: column;
		padding: 6px 10px;
		border-radius: 8px;
		cursor: pointer;
	}
	[aria-selected='true'] {
		background: var(--pill);
	}
	.l {
		font-size: 14px;
	}
	.s {
		font-size: 12px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.keys {
		margin: 0;
	}
</style>
