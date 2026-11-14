<!-- Keep (FEATURES §5): side nav (notes, binders, labels, archive, trash) · search · New note · Pinned · notes · Select mode. -->
<script lang="ts">
	import { afterNavigate, goto, invalidateAll, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { del, patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import KeepNote from '$lib/components/KeepNote.svelte';
	import type { NoteDTO } from '$lib/types';

	let { data } = $props();
	const notes = $derived(data.notes as NoteDTO[]);
	const pinned = $derived(notes.filter((n) => n.pinned));
	const rest = $derived(notes.filter((n) => !n.pinned));
	const labelName = (id: string) => data.labels.find((l) => l.id === id)?.name ?? '';
	const binderName = $derived(data.binders.find((b) => b.id === data.binder)?.name ?? '');
	const title = $derived(
		data.scope === 'archive'
			? 'Archive'
			: data.scope === 'trash'
				? 'Trash'
				: data.scope === 'shared'
					? 'Shared with me'
					: binderName || 'Notes',
	);

	// ---------- url state ----------
	function go(p: Record<string, string | string[] | null>) {
		const u = new URL(page.url);
		for (const [k, v] of Object.entries(p)) {
			u.searchParams.delete(k);
			for (const x of Array.isArray(v) ? v : v ? [v] : []) u.searchParams.append(k, x);
		}
		u.searchParams.delete('note');
		void goto(u.pathname + u.search, { keepFocus: true, noScroll: true });
	}
	let q = $derived(data.q);
	let qt: ReturnType<typeof setTimeout> | null = null;
	function search() {
		if (qt) clearTimeout(qt);
		qt = setTimeout(() => go({ q: q.trim() || null }), 300);
	}

	// ---------- open note ----------
	let open = $state<NoteDTO | 'new' | null>(null);
	// an open note = one history entry: Back / edge swipe closes it and stays on Keep (owner 2026-11-14)
	let pushed = false;
	function show(n: NoteDTO | 'new') {
		open = n;
		if (!pushed) pushState('', { keepNote: n === 'new' ? 'new' : n.id });
		pushed = true;
	}
	function hide() {
		if (pushed)
			history.back(); // the effect below clears `open`
		else open = null;
	}
	// Back closes it. popstate, not page.state: saving refreshes the page data, which drops page.state
	onMount(() => {
		const pop = () => {
			if (!pushed) return;
			pushed = false;
			open = null;
		};
		addEventListener('popstate', pop);
		return () => removeEventListener('popstate', pop);
	}); // ?note=… (search, reminders, widget) and ?new (Ctrl+K, widget +): drop the param, then open like a tap.
	afterNavigate(() => {
		const id = page.url.searchParams.get('note');
		const isNew = page.url.searchParams.has('new');
		const n = id ? notes.find((x) => x.id === id) : undefined;
		if (!n && !isNew) return;
		const u = new URL(page.url);
		u.searchParams.delete('note');
		u.searchParams.delete('new');
		setTimeout(() => {
			replaceState(u, {});
			show(n ?? 'new');
		}); // first load: afterNavigate runs before the router is ready for shallow routing
	});
	const refresh = () => invalidateAll();

	// ---------- select mode (bulk) ----------
	let selecting = $state(false);
	let picked = $state<string[]>([]);
	async function bulk(p: Record<string, unknown>, msg: string) {
		const ids = [...picked];
		try {
			for (const id of ids) await patch(`/api/keep/notes/${id}`, p);
			picked = [];
			selecting = false;
			await refresh();
			showToast(`${msg} ${ids.length}`);
		} catch (e) {
			showError(e);
			await refresh();
		}
	}

	async function quick(n: NoteDTO, p: Record<string, unknown>, msg: string, undo: Record<string, unknown>) {
		try {
			await patch(`/api/keep/notes/${n.id}`, p);
			await refresh();
			showToast(msg, {
				undo: async () => {
					await patch(`/api/keep/notes/${n.id}`, undo);
					await refresh();
				},
			});
		} catch (e) {
			showError(e);
		}
	}
	async function forever(n: NoteDTO) {
		if (!confirm(`Delete "${n.title || 'this note'}" for good? This can't be undone.`)) return;
		try {
			await del(`/api/keep/notes/${n.id}`);
			await refresh();
			showToast('Deleted for good');
		} catch (e) {
			showError(e);
		}
	}
	async function move(n: NoteDTO, dir: -1 | 1) {
		const list = n.pinned ? pinned : rest;
		const i = list.findIndex((x) => x.id === n.id);
		const target = dir === -1 ? list[i - 1] : list[i + 2];
		if (dir === -1 && !target) return;
		try {
			await post(`/api/keep/notes/${n.id}/move`, {
				before: target?.id ?? null,
				binder: data.binder || undefined,
			});
			await refresh();
		} catch (e) {
			showError(e);
		}
	}

	// ---------- binders + labels ----------
	async function newBinder() {
		const name = prompt('Binder name');
		if (!name?.trim()) return;
		try {
			const r = await post<{ binder: { id: string } }>('/api/keep/binders', { name });
			await refresh();
			go({ binder: r.binder.id, scope: null, label: null, q: null });
		} catch (e) {
			showError(e);
		}
	}
	async function editThing(kind: 'binders' | 'labels', id: string, name: string) {
		const v = prompt(`Rename (empty = delete; notes are kept)`, name);
		if (v === null) return;
		try {
			if (v.trim()) await patch(`/api/keep/${kind}/${id}`, { name: v });
			else if (confirm(`Delete "${name}"? Notes stay.`)) {
				await del(`/api/keep/${kind}/${id}`);
				if (kind === 'binders' && data.binder === id) go({ binder: null });
				else if (kind === 'labels') go({ label: data.labelFilter.filter((x: string) => x !== id) });
			}
			await refresh();
		} catch (e) {
			showError(e);
		}
	}
	const toggleLabel = (id: string) =>
		go({
			label: data.labelFilter.includes(id)
				? data.labelFilter.filter((x: string) => x !== id)
				: [...data.labelFilter, id],
		});
</script>

<svelte:head><title>{title} · Keep · Life Tracker</title></svelte:head>

<main class="keep">
	<div class="top">
		<h1>{title}</h1>
		{#if data.scope !== 'shared'}<input
				class="search"
				type="search"
				placeholder="Search notes and checklists"
				aria-label="Search notes"
				bind:value={q}
				oninput={search}
			/>{/if}
		{#if data.scope === 'active'}<button class="btn primary" type="button" onclick={() => show('new')}
				>New note</button
			>{/if}
		{#if data.scope !== 'shared'}<button
				class="btn sm"
				type="button"
				aria-pressed={selecting}
				onclick={() => ((selecting = !selecting), (picked = []))}>{selecting ? 'Done' : 'Select'}</button
			>{/if}
	</div>
	<nav class="side card" aria-label="Keep">
		<a href="/keep" class:on={data.scope === 'active' && !data.binder}>Notes</a>
		<div class="grp">
			<span class="label">Binders</span>
			{#each data.binders as b (b.id)}
				<div class="row">
					<a href="/keep?binder={b.id}" class:on={data.binder === b.id}
						>▣ {b.name} <span class="n">{b.count}</span></a
					>
					<button
						class="mini"
						type="button"
						aria-label="Rename or delete binder {b.name}"
						onclick={() => editThing('binders', b.id, b.name)}>⋯</button
					>
				</div>
			{/each}
			<button class="mini wide" type="button" onclick={newBinder}>New binder</button>
		</div>
		<div class="grp">
			<span class="label">Labels</span>
			{#each data.labels as l (l.id)}
				<div class="row">
					<button
						type="button"
						class="lab"
						aria-pressed={data.labelFilter.includes(l.id)}
						onclick={() => toggleLabel(l.id)}>#{l.name} <span class="n">{l.count}</span></button
					>
					<button
						class="mini"
						type="button"
						aria-label="Rename or delete label {l.name}"
						onclick={() => editThing('labels', l.id, l.name)}>⋯</button
					>
				</div>
			{:else}<span class="hint">Add labels inside a note.</span>{/each}
		</div>
		<a href="/keep?scope=shared" class:on={data.scope === 'shared'}>Shared with me</a>
		<a href="/keep?scope=archive" class:on={data.scope === 'archive'}>Archive</a>
		<a href="/keep?scope=trash" class:on={data.scope === 'trash'}>Trash</a>
	</nav>

	<section class="main">
		{#if data.q || data.labelFilter.length}
			<p class="filters">
				{#if data.q}Matching "{data.q}"{/if}
				{#each data.labelFilter as l (l)}<span class="tag">#{labelName(l)}</span>{/each}
				<button class="mini wide" type="button" onclick={() => ((q = ''), go({ q: null, label: null }))}
					>Clear</button
				>
				<span class="hint">· newest first</span>
			</p>
		{/if}
		{#if selecting}
			<div class="bulkbar" role="toolbar" aria-label="Selected notes">
				<span>{picked.length} selected</span>
				{#if data.scope === 'trash'}
					<button
						class="btn sm"
						type="button"
						disabled={!picked.length}
						onclick={() => bulk({ trashed: false }, 'Restored')}>Restore</button
					>
				{:else}
					<button
						class="btn sm"
						type="button"
						disabled={!picked.length}
						onclick={() =>
							bulk(
								{ archived: data.scope !== 'archive' },
								data.scope === 'archive' ? 'Unarchived' : 'Archived',
							)}>{data.scope === 'archive' ? 'Unarchive' : 'Archive'}</button
					>
					<button
						class="btn sm"
						type="button"
						disabled={!picked.length}
						onclick={() => bulk({ trashed: true }, 'Moved to Trash:')}>Delete</button
					>
				{/if}
			</div>
		{/if}

		{#if !notes.length}
			<div class="empty card">
				{#if data.q || data.labelFilter.length}No notes match. <button
						class="mini wide"
						type="button"
						onclick={() => ((q = ''), go({ q: null, label: null }))}>Clear</button
					>
				{:else if data.scope === 'trash'}Trash is empty. Notes here are deleted for good after 30 days.
				{:else if data.scope === 'archive'}Nothing archived.
				{:else if data.scope === 'shared'}No notes shared with you yet. When someone shares one, it shows
					here.
				{:else if data.binder}This binder is empty. Open a note and tick "▣ {binderName}" to add it.
				{:else}No notes yet. <button class="btn sm primary" type="button" onclick={() => show('new')}
						>Create one</button
					>{/if}
			</div>
		{/if}

		{#snippet card(n: NoteDTO)}
			<article
				class="note"
				style:--nbg={n.color ?? 'var(--card)'}
				class:tinted={!!n.color}
				class:sel={picked.includes(n.id)}
			>
				{#if selecting}
					<label class="pick"
						><input
							type="checkbox"
							checked={picked.includes(n.id)}
							onchange={() =>
								(picked = picked.includes(n.id) ? picked.filter((x) => x !== n.id) : [...picked, n.id])}
						/> Select</label
					>
				{/if}
				<button
					type="button"
					class="open"
					onclick={() => (data.scope === 'trash' ? null : show(n))}
					disabled={data.scope === 'trash'}
					aria-label="Open note {n.title || n.body.slice(0, 40)}"
				>
					{#if n.images[0]}<img src={n.images[0].url} alt="" loading="lazy" />{/if}
					{#if n.title}<h3>{n.title}</h3>{/if}
					{#if n.type === 'checklist'}
						<ul>
							{#each n.items.slice(0, 8) as i (i.id)}<li
									class:done={i.checked}
									style:padding-left="{i.parentId ? 14 : 0}px"
								>
									{i.checked ? '☑' : '☐'}
									{i.text}
								</li>{/each}
							{#if n.items.length > 8}<li class="hint">+{n.items.length - 8} more</li>{/if}
						</ul>
					{:else}<p>{n.body.slice(0, 400)}</p>{/if}
				</button>
				{#if data.shared[n.id]}<p class="hint from">
						from {data.shared[n.id]?.owner} · {data.shared[n.id]?.permission === 'edit'
							? 'can edit'
							: 'view only'}
					</p>{/if}
				{#if n.labels.length}<div>
						{#each n.labels as l (l)}<span class="tag">#{labelName(l)}</span>{/each}
					</div>{/if}
				{#if data.scope !== 'shared'}<div class="acts" class:trash={data.scope === 'trash'}>
						{#if data.scope === 'trash'}
							<button
								class="mini wide"
								type="button"
								onclick={() => quick(n, { trashed: false }, 'Restored', { trashed: true })}>Restore</button
							>
							<button class="mini wide" type="button" onclick={() => forever(n)}>Delete forever</button>
						{:else}
							{#if data.scope === 'active'}
								<button
									class="mini"
									type="button"
									aria-label="Move {n.title || 'note'} up"
									onclick={() => move(n, -1)}>↑</button
								>
								<button
									class="mini"
									type="button"
									aria-label="Move {n.title || 'note'} down"
									onclick={() => move(n, 1)}>↓</button
								>
								<button
									class="mini wide"
									type="button"
									aria-pressed={n.pinned}
									onclick={() =>
										quick(n, { pinned: !n.pinned }, n.pinned ? 'Unpinned' : 'Pinned', { pinned: n.pinned })}
									>{n.pinned ? 'Unpin' : 'Pin'}</button
								>
							{/if}
							<button
								class="mini wide"
								type="button"
								onclick={() =>
									quick(n, { archived: !n.archived }, n.archived ? 'Unarchived' : 'Note archived', {
										archived: n.archived,
									})}>{n.archived ? 'Unarchive' : 'Archive'}</button
							>
							<button
								class="mini wide"
								type="button"
								onclick={() => quick(n, { trashed: true }, 'Moved to Trash', { trashed: false })}
								>Delete</button
							>
						{/if}
					</div>{/if}
			</article>
		{/snippet}

		{#if pinned.length}
			<h2 class="label">Pinned</h2>
			<div class="grid">
				{#each pinned as n (n.id)}{@render card(n)}{/each}
			</div>
			{#if rest.length}<h2 class="label">Others</h2>{/if}
		{/if}
		<div class="grid">
			{#each rest as n (n.id)}{@render card(n)}{/each}
		</div>
	</section>
</main>

{#if open}
	{#key open === 'new' ? 'new' : open.id}
		<KeepNote
			note={open === 'new' ? null : open}
			labels={data.labels}
			binders={data.binders}
			colors={data.colors}
			shared={open !== 'new' ? data.shared[open.id]?.permission : undefined}
			onclose={hide}
			onchanged={refresh}
		/>
	{/key}
{/if}

<style>
	/* desktop: tree left, title + list right · phone (wireframe MKeep): title, search, chip row, notes */
	.keep {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		grid-template-areas: 'side top' 'side main';
		grid-template-rows: auto 1fr;
		gap: 12px 24px;
		padding: 8px 24px 40px;
		max-width: 1440px;
		margin: 0 auto;
		align-items: start;
	}
	.top {
		grid-area: top;
	}
	.side {
		grid-area: side;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		position: sticky;
		top: 80px;
	}
	.side a,
	.lab {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		min-height: 28px;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 14px;
		color: var(--ink);
		text-decoration: none;
		background: none;
		border: 0;
		font: inherit;
		cursor: pointer;
		text-align: left;
		overflow-wrap: anywhere;
	}
	.side a.on,
	.lab[aria-pressed='true'] {
		background: var(--pill);
		color: var(--pill-ink);
		font-weight: 600;
	}
	.grp {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 8px 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.n {
		margin-left: auto;
		font-size: 11px;
		color: var(--muted);
	}
	.main {
		grid-area: main;
		min-width: 0;
	}
	.top {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	.top h1 {
		margin: 0 8px 0 0;
		font-size: 22px;
	}
	.search {
		flex: 1;
		min-width: 180px;
		min-height: 36px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--ink);
		font: inherit;
	}
	.filters,
	.bulkbar {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		font-size: 13px;
	}
	.grid {
		columns: 240px;
		column-gap: 16px;
		margin-top: 12px;
	}
	.note {
		break-inside: avoid;
		margin: 0 0 16px;
		border: 1.5px solid var(--border);
		border-radius: 12px;
		padding: 10px 12px;
		background: var(--nbg);
		font-size: 13px;
		line-height: 1.45;
	}
	.note.tinted {
		color: #00003d;
	}
	.note.sel {
		outline: 3px solid var(--accent);
	}
	.open {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.open:disabled {
		cursor: default;
	}
	.note {
		transition: transform var(--t-fast) var(--ease);
	}
	.note:has(.open:active:not(:disabled)) {
		transform: scale(0.98); /* press feedback before the editor opens */
	}
	.open img {
		width: 100%;
		border-radius: 8px;
		margin-bottom: 6px;
	}
	.open h3 {
		margin: 0 0 4px;
		font-size: 14px;
	}
	.open p {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.open ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.open li.done {
		text-decoration: line-through;
		opacity: 0.7;
	}
	.tag {
		display: inline-block;
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid #6b6b8f;
		margin: 6px 4px 0 0;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 8px;
		opacity: 0;
	}
	.note:hover .acts,
	.note:focus-within .acts {
		opacity: 1;
	}
	@media (hover: none) {
		.acts {
			opacity: 1;
		}
	}
	.mini {
		min-width: 24px;
		min-height: 24px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 12px;
	}
	.mini.wide {
		padding: 0 8px;
	}
	.pick {
		display: flex;
		gap: 6px;
		font-size: 12px;
		margin-bottom: 4px;
	}
	.empty {
		padding: 24px;
		margin-top: 16px;
		text-align: center;
	}
	h2.label {
		margin: 16px 0 0;
	}
	@media (max-width: 699px) {
		.keep {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'top' 'side' 'main';
			grid-template-rows: auto;
			gap: 10px;
			padding: 4px 16px 24px;
		}
		.top h1 {
			flex: 1;
			font-size: 28px;
		}
		.top .search {
			order: 3;
			flex: 1 1 100%;
			min-height: 44px;
		}
		/* one swipe row of chips: Notes · binders · labels · Shared · Archive · Trash */
		.side {
			position: static;
			width: auto;
			flex-direction: row;
			flex-wrap: nowrap;
			align-items: center;
			gap: 6px;
			overflow-x: auto;
			margin: 0 -16px;
			padding: 2px 16px 4px;
			background: none;
			border: 0;
			box-shadow: none;
			border-radius: 0;
		}
		.grp {
			flex-direction: row;
			flex-wrap: nowrap;
			gap: 6px;
			margin: 0;
		}
		.grp .label,
		.grp .hint {
			display: none;
		}
		.side a,
		.lab,
		.mini.wide {
			flex: none;
			white-space: nowrap;
			min-height: 36px;
			padding: 0 14px;
			border: 1.5px solid var(--border);
			border-radius: 999px;
			background: var(--card);
			font-size: 13px;
			font-weight: 600;
			overflow-wrap: normal;
		}
		.side a.on,
		.lab[aria-pressed='true'] {
			background: var(--pill-card);
		}
		.row {
			flex: none;
		}
		.grid {
			columns: 2;
			column-gap: 10px;
		}
		.note {
			margin-bottom: 10px;
		}
		/* phone: Pin / Archive / Delete live inside the note; the card keeps ↑ ↓ only */
		.acts:not(.trash) .wide {
			display: none;
		}
	}
</style>
