<!-- One page: breadcrumbs, title, ⋯ menu (pin, move, archive, delete, copy link), "Archived · Restore" bar, editor. -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { del, get, patch, post, apiFetch } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import PageEditor from '$lib/editor/PageEditor.svelte';
	import DbCell from '$lib/database/DbCell.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import type { PageDTO, PageNode, UndoRef } from '$lib/types';

	let { data } = $props();
	const pg = $derived(data.page as PageDTO);
	const tree = $derived(data.tree as PageNode[]);
	let title = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved' | 'failed' | 'conflict'>('idle');
	let editor: PageEditor | undefined = $state();
	let menu = $state(false);
	let moving = $state(false);
	let sharing = $state(false);
	const mine = $derived(pg.access === 'owner');
	// new page opened: take its title; a reload of the same page keeps what is being typed
	let shownId = '';
	$effect.pre(() => {
		if (pg.id === shownId) return;
		shownId = pg.id;
		title = pg.title;
		saveState = 'idle';
	});

	const rec = $derived(data.record);
	async function setValue(propId: string, v: unknown): Promise<string | null> {
		if (!rec) return null;
		try {
			await patch(`/api/database-records/${rec.recordId}`, { values: { [propId]: v } });
			await invalidateAll();
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : 'Not saved';
		}
	}

	let tt: ReturnType<typeof setTimeout> | null = null;
	function onTitle() {
		saveState = 'saving';
		if (tt) clearTimeout(tt);
		tt = setTimeout(saveTitle, 500);
	}
	async function saveTitle() {
		try {
			await editor?.flush(); // one writer at a time: the revision must line up
			const r = await patch<{ page: PageDTO }>(`/api/pages/${pg.id}`, { title });
			editor?.setRevision(r.page.revision);
			saveState = 'saved';
			await invalidateAll();
		} catch (e) {
			saveState = 'failed';
			showError(e);
		}
	}

	async function pin() {
		try {
			const cur = (await get<{ pins: { id: string }[] }>('/api/page-shortcuts')).pins.map((p) => p.id);
			const next = pg.pinned ? cur.filter((x) => x !== pg.id) : [...cur, pg.id];
			await apiFetch('PUT', '/api/page-shortcuts', { ids: next });
			await invalidateAll();
			showToast(pg.pinned ? 'Unpinned from header' : 'Pinned to header');
		} catch (e) {
			showError(e); // 4th pin: "You can pin 3 pages. Unpin one first."
		}
		menu = false;
	}
	async function archive() {
		menu = false;
		try {
			await editor?.flush();
			const r = await post<{ count: number; unpinned: number; undo: UndoRef }>(`/api/pages/${pg.id}/archive`);
			await invalidateAll();
			showToast(
				`Archived${r.count > 1 ? ` with ${r.count - 1} subpages` : ''}${r.unpinned ? ' · removed from header pins' : ''}`,
				{
					undo: async () => void ((await undoLast(r.undo.id)) && (await invalidateAll())),
				},
			);
		} catch (e) {
			showError(e);
		}
	}
	async function restore() {
		try {
			await post(`/api/pages/${pg.id}/restore`);
			await invalidateAll();
			showToast('Restored');
		} catch (e) {
			showError(e);
		}
	}
	async function trash() {
		menu = false;
		const subs = tree.filter((n) => n.parentId === pg.id).length;
		if (
			!confirm(
				`Move "${pg.title || 'Untitled'}"${subs ? ' and its subpages' : ''} to Trash? You can restore it for 30 days.`,
			)
		)
			return;
		try {
			await editor?.flush();
			const r = await del<{ batch: string }>(`/api/pages/${pg.id}`);
			await invalidateAll();
			await goto('/pages');
			showToast('Moved to Trash', {
				undo: async () => {
					await post(`/api/pages/trash/${r.batch}/restore`);
					await goto(`/pages/${pg.id}`, { invalidateAll: true });
				},
			});
		} catch (e) {
			showError(e);
		}
	}
	/** pages it may move under: not itself, not its own subpages */
	const targets = $derived.by(() => {
		const bad = [pg.id];
		for (let i = 0; i < bad.length; i++) for (const n of tree) if (n.parentId === bad[i]) bad.push(n.id);
		return tree.filter((n) => !bad.includes(n.id));
	});
	async function moveTo(parentId: string | null) {
		moving = false;
		try {
			await post(`/api/pages/${pg.id}/move`, { parentId });
			await invalidateAll();
			showToast('Moved');
		} catch (e) {
			showError(e);
		}
	}
	async function reorder(dir: -1 | 1) {
		menu = false;
		const sibs = tree.filter((n) => n.parentId === pg.parentId);
		const i = sibs.findIndex((n) => n.id === pg.id);
		const before = dir === -1 ? sibs[i - 1]?.id : sibs[i + 2]?.id;
		if (dir === -1 && !before) return;
		try {
			await post(`/api/pages/${pg.id}/move`, { parentId: pg.parentId, before: before ?? null });
			await invalidateAll();
		} catch (e) {
			showError(e);
		}
	}
</script>

<svelte:head><title>{pg.title || 'Untitled'} · Pages · Life Tracker</title></svelte:head>

{#if pg.archived && mine}
	<div class="arch" role="status">
		Archived · it's out of the sidebar and search, links and the graph still work. <button
			class="btn sm"
			type="button"
			onclick={restore}>Restore</button
		>
	</div>
{/if}

<article class="card pagev">
	<div class="bar">
		<nav class="crumbs" aria-label="Breadcrumbs">
			<a href="/pages">Pages</a>
			{#each pg.crumbs as c (c.id)}<span aria-hidden="true">/</span><a href="/pages/{c.id}"
					>{c.title || 'Untitled'}</a
				>{/each}
			<span aria-hidden="true">/</span><span class="here">{title || 'Untitled'}</span>
		</nav>
		<span class="state" role="status">
			{#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}Saved{:else if saveState === 'failed'}<button
					class="btn sm"
					type="button"
					onclick={() => editor?.retry()}>Save failed · Retry</button
				>{:else if saveState === 'conflict'}Changed elsewhere: copy your text, then <a
					href="/pages/{pg.id}"
					data-sveltekit-reload>reload</a
				>{/if}
		</span>
		{#if mine && !pg.archived}
			<button class="btn sm" type="button" aria-pressed={pg.pinned} title="Pin to header" onclick={pin}
				><svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill={pg.pinned ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M12 17v5M9 10.8V4h6v6.8l3 3.2H6z" /></svg
				>Pin</button
			>
		{/if}
		{#if mine}<button class="btn sm" type="button" onclick={() => (sharing = true)}>Share</button>{/if}
		<div class="menu-wrap">
			<button
				class="btn sm"
				type="button"
				aria-haspopup="menu"
				aria-expanded={menu}
				aria-label="Page menu"
				onclick={() => (menu = !menu)}>⋯</button
			>
			{#if menu}
				<div class="menu card" role="menu">
					{#if mine}
						<button role="menuitem" type="button" onclick={() => ((moving = true), (menu = false))}
							>Move to…</button
						>
						<button role="menuitem" type="button" onclick={() => reorder(-1)}>Move up</button>
						<button role="menuitem" type="button" onclick={() => reorder(1)}>Move down</button>
					{/if}
					<button
						role="menuitem"
						type="button"
						onclick={() => (
							navigator.clipboard?.writeText(location.href),
							(menu = false),
							showToast('Link copied')
						)}>Copy link</button
					>
					{#if mine}
						{#if !pg.archived}<button role="menuitem" type="button" onclick={archive}>Archive</button>{/if}
						<button role="menuitem" type="button" class="danger" onclick={trash}>Delete…</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
	<div class="body">
		<input
			class="title"
			placeholder="Untitled"
			aria-label="Page title"
			maxlength="300"
			readonly={pg.access === 'view'}
			bind:value={title}
			oninput={onTitle}
		/>
		{#if !mine}<p class="shared" role="status">
				Shared with you · {pg.access === 'edit' ? 'you can edit' : 'view only'}
			</p>{/if}
		{#if sharing}<ShareDialog kind="page" id={pg.id} name={pg.title} onclose={() => (sharing = false)} />{/if}
		{#if moving}
			<div class="moveto">
				<label
					>Move "{pg.title || 'Untitled'}" inside
					<select onchange={(e) => moveTo(e.currentTarget.value || null)}>
						<option value="" selected={!pg.parentId}>— top level —</option>
						{#each targets as t (t.id)}<option value={t.id} selected={pg.parentId === t.id}
								>{t.title || 'Untitled'}</option
							>{/each}
					</select></label
				>
				<button class="btn sm" type="button" onclick={() => (moving = false)}>Cancel</button>
			</div>
		{/if}
		{#if rec}
			<div class="rec">
				<a href="/pages/{rec.dbPageId}">← Back to {rec.dbTitle || 'database'}</a>
				<dl>
					{#each rec.props.filter((p) => p.type !== 'title') as p (p.id)}
						<dt>{p.name}</dt>
						<dd>
							<DbCell
								prop={p}
								value={rec.row.values[p.id] ?? null}
								invalid={rec.row.invalid?.includes(p.id)}
								label={p.name}
								onsave={(v) => setValue(p.id, v)}
							/>
						</dd>
					{/each}
				</dl>
			</div>
		{/if}
		{#key pg.id}
			<PageEditor bind:this={editor} page={pg} onstate={(s) => (saveState = s)} />
		{/key}
	</div>
</article>
<svelte:window
	onclick={(e) => menu && !(e.target as HTMLElement).closest('.menu-wrap') && (menu = false)}
	onbeforeunload={(e) => editor?.dirty() && e.preventDefault()}
/>

<style>
	.shared {
		margin: 0 0 6px;
		font-size: 12px;
		color: var(--quiet);
	}
	.rec {
		margin: 8px 0 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--rule);
		font-size: 13.5px;
	}
	.rec dl {
		display: grid;
		grid-template-columns: minmax(90px, 160px) 1fr;
		gap: 4px 12px;
		margin: 8px 0 0;
		align-items: center;
	}
	.rec dt {
		color: var(--quiet);
	}
	.rec dd {
		margin: 0;
	}
	.arch {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 8px 14px;
		margin-bottom: 10px;
		border-radius: 10px;
		background: var(--accent);
		color: #00003d;
		font-size: 13px;
	}
	.pagev {
		min-height: 70vh;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 12px 20px;
		border-bottom: 1px solid var(--rule);
	}
	.crumbs {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 13px;
		color: var(--quiet);
	}
	.crumbs a {
		color: var(--quiet);
	}
	.crumbs .here {
		color: var(--ink);
	}
	.bar .btn {
		gap: 6px;
	}
	.bar .btn[aria-pressed='true'] {
		background: var(--pill-card);
		color: var(--pill-ink);
	}
	.body {
		max-width: 760px;
		margin: 0 auto;
		padding: 32px 56px 48px;
	}
	/* database pages need the room for columns (wireframe Database) */
	.body:has(:global(section[data-db])) {
		max-width: none;
		padding: 28px 40px 40px;
	}
	.title {
		display: block;
		width: 100%;
		margin: 0 0 12px;
		padding: 0;
		font: inherit;
		font-size: 32px;
		font-weight: 700;
		line-height: 1.25;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--ink);
	}
	.state {
		font-size: 12px;
		color: var(--quiet);
	}
	@media (max-width: 699px) {
		.bar {
			padding: 10px 12px;
		}
		.body {
			padding: 20px 16px 32px;
		}
		.title {
			font-size: 26px;
		}
	}
	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 34px;
		z-index: 20;
		min-width: 190px;
		padding: 4px;
		display: flex;
		flex-direction: column;
	}
	.menu button {
		text-align: left;
		min-height: 32px;
		padding: 0 10px;
		background: none;
		border: 0;
		border-radius: 6px;
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.menu button:hover {
		background: var(--pill);
	}
	.menu .danger {
		color: var(--exam-edge);
	}
	.moveto {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;
		font-size: 13px;
	}
</style>
