<!-- Ctrl+K / Cmd+K (UX-AUDIT #9, UX-4): search pages, notes, planner items + jump to actions. Mine only. -->
<script lang="ts">
	import { backCloses, leave } from '$lib/client/layers';
	import { goto } from '$app/navigation';
	import { get, post } from '$lib/client/api';
	import { openItem } from '$lib/client/peek.svelte';
	import { showError } from '$lib/client/toast.svelte';
	import { tick } from 'svelte';
	import { isPhone } from '$lib/client/phone';

	let { onquickadd }: { onquickadd?: () => void } = $props();

	interface Row {
		group: 'Actions' | 'Pages' | 'Notes' | 'Planner' | 'Recent';
		label: string;
		sub?: string;
		run: () => void | Promise<void>;
		go?: { to?: string; item?: string }; // a result (not an action): remembered as a phone recent
	}
	let open = $state(false);
	let q = $state('');
	let sel = $state(0);
	let includeArchived = $state(false);
	let results = $state<Row[]>([]);
	let input: HTMLInputElement | undefined = $state();

	const ACTIONS: Row[] = [
		{ group: 'Actions', label: 'Quick add', sub: 'N', run: () => onquickadd?.() },
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

	// phone (#99): full screen, no desktop actions or key hints; empty box = recent results, then
	// Planner · Keep · Pages
	let phone = $state(false);
	const RECENT = 'lt-search-recent';
	type Saved = Pick<Row, 'group' | 'label' | 'sub' | 'go'>;
	const revive = (r: Saved): Row => ({
		...r,
		run: () => (r.go?.item ? openItem(r.go.item) : goto(r.go?.to ?? '/')),
	});
	function recent(): Row[] {
		try {
			return (JSON.parse(localStorage.getItem(RECENT) ?? '[]') as Saved[]).map(revive);
		} catch {
			return [];
		}
	}
	function remember(r: Row) {
		try {
			const keep = recent().filter((x) => x.label !== r.label || x.group !== r.group);
			const out = [r, ...keep].slice(0, 8).map(({ group, label, sub, go }) => ({ group, label, sub, go }));
			localStorage.setItem(RECENT, JSON.stringify(out));
		} catch {
			/* private mode: no recents */
		}
	}
	const start = () => (phone ? recent().map((r) => ({ ...r, group: 'Recent' as const })) : ACTIONS);

	export async function show() {
		open = true;
		phone = isPhone();
		q = '';
		sel = 0;
		results = start();
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
		const acts = phone ? [] : ACTIONS.filter((a) => a.label.toLowerCase().includes(term.toLowerCase()));
		if (!term) return void (results = start());
		try {
			const r = await get<{ hits: { kind: 'page' | 'note'; id: string; title: string; snippet: string; archived: boolean }[]; items: { id: string; title: string; date: string | null }[] }>(
				`/api/search?q=${encodeURIComponent(term)}${includeArchived ? '&archived=1' : ''}`,
			); // prettier-ignore
			if (n !== seq) return;
			const pages = r.hits
				.filter((h) => h.kind === 'page')
				.map((h): Row =>
					revive({
						group: 'Pages',
						label: h.title || 'Untitled',
						sub: (h.archived ? 'archived · ' : '') + h.snippet,
						go: { to: `/pages/${h.id}` },
					}),
				);
			const notes = r.hits
				.filter((h) => h.kind === 'note')
				.map((h): Row =>
					revive({
						group: 'Notes',
						label: h.title || h.snippet || 'Note',
						sub: h.archived ? 'archived' : h.title ? h.snippet : '',
						go: { to: `/keep?${h.archived ? 'scope=archive&' : ''}note=${h.id}` },
					}),
				);
			const plan = r.items.map((i): Row =>
				revive({ group: 'Planner', label: i.title, sub: i.date ?? 'no date', go: { item: i.id } }),
			);
			results = phone ? [...plan, ...notes, ...pages] : [...acts, ...pages, ...notes, ...plan];
		} catch (e) {
			showError(e);
		}
	}
	async function pick(r: Row | undefined) {
		if (!r) return;
		open = false;
		if (phone && r.go) remember(r);
		if (r.go ? r.go.to : r.label !== 'Quick add') leave(); // a goto: its entry replaces the palette's Back entry
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
	<div
		use:backCloses={() => (open = false)}
		class="pal card"
		role="dialog"
		aria-modal="true"
		aria-label="Search and go"
	>
		<div class="top">
			<button class="close" type="button" aria-label="Close search" onclick={() => (open = false)}
				><svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg
				></button
			>
			<input
				bind:this={input}
				bind:value={q}
				oninput={onInput}
				onkeydown={onKey}
				placeholder={phone
					? 'Search planner, notes, pages'
					: 'Search pages, notes, planner… or type an action'}
				aria-label="Search"
				role="combobox"
				aria-expanded="true"
				aria-controls="cmdk-list"
				aria-activedescendant={results.length ? `cmdk-${sel}` : undefined}
				enterkeyhint="search"
			/>
		</div>
		<label class="arch"
			><input type="checkbox" bind:checked={includeArchived} onchange={run} /> Include archived</label
		>
		<div id="cmdk-list" role="listbox" aria-label="Results">
			{#each results as r, i (i)}
				{#if i === 0 || results[i - 1]?.group !== r.group}<div class="grp">
						{phone && r.group === 'Notes' ? 'Keep' : r.group}
					</div>{/if}
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
			{:else}<p class="hint">
					{phone && !q
						? 'What you open from here shows up first next time.'
						: `Nothing found${q ? ` for "${q}"` : ''}.`}
				</p>{/each}
		</div>
		{#if !phone}<p class="hint keys">↑↓ move · Enter open · Esc close</p>{/if}
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
	.top {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.close {
		display: none;
	}
	.top > input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
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
		font-size: max(var(--fs-min), 11px);
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
		color: var(--pill-ink);
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
	/* phone (#99): a full screen of its own, over the tab bar; big rows for a thumb */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.pal {
			inset: 0;
			top: 0;
			translate: none;
			width: auto;
			max-height: none;
			border-radius: 0;
			border: 0;
			padding: calc(8px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right))
				calc(8px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
		}
		.close {
			display: grid;
			place-items: center;
			flex: none;
			width: 48px;
			height: 48px;
			border: 0;
			background: none;
			color: var(--ink);
			cursor: pointer;
		}
		.top > input {
			min-height: 48px;
		}
		.arch {
			min-height: 48px;
			font-size: 14px;
		}
		.arch input {
			width: 20px;
			height: 20px;
		}
		[role='listbox'] {
			flex: 1;
		}
		[role='option'] {
			min-height: 56px;
			justify-content: center;
			padding: 6px 12px;
		}
		.l {
			font-size: 16px;
		}
		.s {
			font-size: 13px;
		}
	}
</style>
