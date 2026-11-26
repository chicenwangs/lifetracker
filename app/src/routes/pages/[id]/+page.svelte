<!-- One page: breadcrumbs, title, ⋯ menu (pin, move, archive, delete, copy link), "Archived · Restore" bar, editor. -->
<script lang="ts">
	import { backCloses } from '$lib/client/layers';
	import { modal } from '$lib/client/modal';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$lib/client/refresh';
	import { del, get, patch, post, apiFetch } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import PageEditor from '$lib/editor/PageEditor.svelte';
	import PageIcon from '$lib/components/PageIcon.svelte';
	import DbCell from '$lib/database/DbCell.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import type { BacklinkDTO, PageDTO, PageNode, UndoRef } from '$lib/types';

	let { data } = $props();
	const pg = $derived(data.page as PageDTO);
	const tree = $derived(data.tree as PageNode[]);
	let title = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved' | 'failed' | 'conflict'>('idle');
	let editor: PageEditor | undefined = $state();
	let menu = $state(false);
	let moving = $state(false);
	let sharing = $state(false);
	let iconPicker: PageIcon | undefined = $state();
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
	// Linked from (PR 20): open by default for 1-5 sources; hidden when 0. Re-evaluated when the page changes.
	const backlinks = $derived((data.backlinks ?? []) as BacklinkDTO[]);
	let linksOpen = $state(true);
	$effect.pre(() => {
		void pg.id;
		linksOpen = backlinks.length > 0 && backlinks.length <= 5;
	});
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

	async function setIcon(icon: string | null) {
		if (icon === pg.icon) return;
		try {
			await editor?.flush(); // one writer at a time: the revision must line up
			const r = await patch<{ page: PageDTO; undo?: UndoRef }>(`/api/pages/${pg.id}`, { icon });
			editor?.setRevision(r.page.revision);
			await invalidateAll();
			const u = r.undo;
			showToast(icon ? 'Icon updated' : 'Icon removed', {
				undo: u
					? async () => {
							if (!(await undoLast(u.id))) return;
							const fresh = await get<{ page: PageDTO }>(`/api/pages/${pg.id}`);
							editor?.setRevision(fresh.page.revision);
							await invalidateAll();
						}
					: undefined,
			});
		} catch (e) {
			showError(e);
		}
	}

	async function pin() {
		try {
			const cur = (await get<{ pins: { id: string }[] }>('/api/page-shortcuts')).pins.map((p) => p.id);
			const was = pg.pinned; // read before invalidateAll swaps pg
			const next = was ? cur.filter((x) => x !== pg.id) : [...cur, pg.id];
			await apiFetch('PUT', '/api/page-shortcuts', { ids: next });
			await invalidateAll();
			showToast(was ? 'Unpinned from header' : 'Pinned to header');
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
	// v4.0 PR 17: the copy opens at once; Undo removes it and returns to this page
	async function duplicate() {
		menu = false;
		const sourceId = pg.id; // pg follows the open page: after goto it is the copy
		try {
			await editor?.flush();
			const r = await post<{ page: PageNode; undo: UndoRef }>(`/api/pages/${sourceId}/duplicate`);
			showToast('Duplicated page', {
				undo: async () => {
					await undoLast(r.undo.id);
					await goto(`/pages/${sourceId}`, { invalidateAll: true });
				},
			});
			await goto(`/pages/${r.page.id}`);
		} catch (e) {
			showError(e);
		}
	}
	async function trash() {
		menu = false;
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
	// v4.0 PR 22: template pages live under Templates in the New page menu, not the sidebar tree
	async function toggleTemplate() {
		menu = false;
		try {
			const r = await post<{ page: PageDTO; undo: UndoRef }>(`/api/pages/${pg.id}/template`, {
				isTemplate: !pg.isTemplate,
			});
			await invalidateAll();
			showToast(r.page.isTemplate ? 'Template created' : 'Template removed', {
				undo: async () => {
					await undoLast(r.undo.id);
					await invalidateAll();
				},
			});
		} catch (e) {
			showError(e);
		}
	}
	// v4.0 PR 31: cover image (the page owner uploads it or picks one of their images; the toast Undo restores)
	let coverInput: HTMLInputElement | undefined = $state();
	let coverBusy = $state(false);
	let coverPick = $state(false);
	let coverImages = $state<{ id: string; name: string }[]>([]);
	async function openCover() {
		menu = false;
		coverPick = true;
		try {
			coverImages = (await get<{ images: { id: string; name: string }[] }>('/api/attachments?list=images'))
				.images;
		} catch (e) {
			showError(e);
		}
	}
	function pickCoverFile() {
		coverInput?.click();
	}
	async function setCover(attId: string | null) {
		const prev = pg.coverAttachmentId ?? null;
		try {
			await patch(`/api/pages/${pg.id}`, { coverAttachmentId: attId });
			await invalidateAll();
			coverPick = false;
			showToast(attId ? 'Cover added' : 'Cover removed', {
				undo:
					prev === attId
						? undefined
						: async () => {
								await patch(`/api/pages/${pg.id}`, { coverAttachmentId: prev });
								await invalidateAll();
							},
			});
		} catch (e) {
			showError(e);
		}
	}
	async function uploadCover(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		input.value = '';
		if (!f) return;
		coverBusy = true;
		try {
			const lim = (await (await fetch('/api/attachments')).json()) as { maxBytes: number; types: string[] };
			if (f.size > lim.maxBytes)
				return showToast(`That image is too big (max ${Math.round(lim.maxBytes / 1048576)} MB).`, {
					kind: 'error',
				});
			const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? '').toLowerCase();
			if (!lim.types.includes(ext))
				return showToast(`${f.name}: this file type isn't allowed.`, { kind: 'error' });
			const res = await fetch(`/api/attachments?name=${encodeURIComponent(f.name)}`, {
				method: 'POST',
				headers: { 'content-type': f.type || 'application/octet-stream' },
				body: f,
			});
			const j = (await res.json()) as { attachment?: { id: string }; error?: { message?: string } };
			if (!res.ok) throw new Error(j.error?.message ?? 'Upload failed');
			if (j.attachment) await setCover(j.attachment.id);
		} catch (err) {
			showError(err);
		} finally {
			coverBusy = false;
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
			<button class="btn sm wide" type="button" aria-pressed={pg.pinned} title="Pin to header" onclick={pin}
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
		{#if mine}<button class="btn sm wide" type="button" onclick={() => (sharing = true)}>Share</button>{/if}
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
				<div use:backCloses={() => (menu = false)} class="menu card" role="menu">
					{#if mine}
						<!-- phone (#98): Pin + Share live here, the bar only has room for ⋯ -->
						{#if !pg.icon}<button
								role="menuitem"
								type="button"
								class="narrow"
								onclick={() => ((menu = false), iconPicker?.openPicker())}>Add icon</button
							>{/if}
						{#if !pg.archived}<button role="menuitem" type="button" class="narrow" onclick={pin}
								>{pg.pinned ? 'Unpin from header' : 'Pin to header'}</button
							>{/if}
						<button
							role="menuitem"
							type="button"
							class="narrow"
							onclick={() => ((sharing = true), (menu = false))}>Share…</button
						>
						<button role="menuitem" type="button" onclick={() => ((moving = true), (menu = false))}
							>Move to…</button
						>
						<button role="menuitem" type="button" onclick={() => reorder(-1)}>Move up</button>
						<button role="menuitem" type="button" onclick={() => reorder(1)}>Move down</button>
					{/if}
					{#if mine}
						<button role="menuitem" type="button" onclick={openCover}
							>{pg.coverAttachmentId ? 'Change cover…' : 'Add cover…'}</button
						>
					{/if}
					<button role="menuitem" type="button" onclick={duplicate}>Duplicate</button>
					{#if mine}
						<button role="menuitem" type="button" onclick={toggleTemplate}
							>{pg.isTemplate ? 'Stop being a template' : 'Make template'}</button
						>
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
		{#if pg.isTemplate}
			<span class="tpl">Template · edits don't change pages made from it</span>
		{/if}
		{#if pg.coverAttachmentId}
			<div class="cover">
				<img src="/api/attachments/{pg.coverAttachmentId}" alt="Page cover" />
				{#if mine && !pg.archived}
					<div class="cover-acts">
						<button class="btn sm" type="button" disabled={coverBusy} onclick={openCover}>Change cover</button
						>
						<button class="btn sm" type="button" disabled={coverBusy} onclick={() => setCover(null)}
							>Remove</button
						>
					</div>
				{/if}
			</div>
		{/if}
		<div class="pico" class:blank={!pg.icon}>
			<PageIcon bind:this={iconPicker} icon={pg.icon} disabled={pg.access === 'view'} onpick={setIcon} />
		</div>
		<input
			class="title"
			autocomplete="off"
			placeholder="Untitled"
			aria-label="Page title"
			maxlength="300"
			readonly={pg.access === 'view'}
			bind:value={title}
			oninput={onTitle}
		/>
		<input
			type="file"
			accept="image/png,image/jpeg,image/gif,image/webp"
			aria-label="Cover image"
			bind:this={coverInput}
			hidden
			onchange={uploadCover}
		/>
		{#if coverPick}
			<div class="scrim" role="presentation" onclick={() => (coverPick = false)}></div>
			<div
				use:backCloses={() => (coverPick = false)}
				use:modal={() => (coverPick = false)}
				class="picker cpick card"
				role="dialog"
				aria-modal="true"
				aria-label="Cover picker"
			>
				<h2 class="cp">Cover image</h2>
				<button class="btn sm" type="button" onclick={pickCoverFile}>Upload image</button>
				{#if coverImages.length}
					<div class="cgrid">
						{#each coverImages as img (img.id)}
							<button
								type="button"
								class="cthumb"
								aria-label={img.name}
								title={img.name}
								onclick={() => setCover(img.id)}
							>
								<img src="/api/attachments/{img.id}" alt={img.name} />
							</button>
						{/each}
					</div>
				{:else}
					<p class="hint">No images yet. Upload one.</p>
				{/if}
				<button class="btn sm" type="button" onclick={() => (coverPick = false)}>Close</button>
			</div>
		{/if}
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
			<PageEditor
				bind:this={editor}
				page={pg}
				tz={data.user?.timezone ?? 'Asia/Kuala_Lumpur'}
				onstate={(s) => (saveState = s)}
			/>
		{/key}
		{#if backlinks.length}
			<section class="linked" aria-labelledby="linked-h">
				<h2 id="linked-h">
					<button type="button" aria-expanded={linksOpen} onclick={() => (linksOpen = !linksOpen)}>
						<span aria-hidden="true">{linksOpen ? '▾' : '▸'}</span> Linked from ({backlinks.length})
					</button>
				</h2>
				{#if linksOpen}
					<ul>
						{#each backlinks as b (b.id)}
							<li class:bl-arch={b.archived}>
								<a class="lt" href="/pages/{b.id}">
									{#if b.icon}<span class="ico" aria-hidden="true">{b.icon}</span>{/if}
									<span class="tt">{b.title || 'Untitled'}</span>
								</a>
								{#if b.archived}<span class="hint">· archived</span>{/if}
								<span class="snip"
									>{#each b.snippet as s, i (i)}{#if s.b}<b>{s.t}</b>{:else}{s.t}{/if}{/each}</span
								>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
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
		padding: 12px;
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
		display: inline-flex;
		align-items: center;
		min-height: 24px;
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
	/* wide column on big screens (owner 2026-11-16: was a narrow strip in the middle) */
	.body {
		max-width: 1400px;
		margin: 0 auto;
		padding: 32px 56px 48px;
	}
	/* v4.0 PR 22: template pill in the header */
	.tpl {
		display: inline-block;
		margin: 0 0 8px;
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--ground);
		color: var(--quiet);
		font-size: 12px;
	}
	/* database pages need the room for columns (wireframe Database) */
	.body:has(:global(section[data-db])) {
		max-width: none;
		padding: 28px 40px 40px;
	}
	/* v4.0 PR 31: cover image (180 px desktop, 120 px phone) */
	.cover {
		position: relative;
		margin: 0 0 14px;
		border-radius: 12px;
		overflow: hidden;
		background: var(--ground);
	}
	.cover img {
		display: block;
		width: 100%;
		height: 180px;
		object-fit: cover;
	}
	.cover-acts {
		position: absolute;
		right: 8px;
		bottom: 8px;
		display: flex;
		gap: 6px;
		opacity: 0;
		transition: opacity 120ms var(--ease);
	}
	.cover:hover .cover-acts,
	.cover:focus-within .cover-acts {
		opacity: 1;
	}
	/* v4.0 PR 31: upload or pick one of the owner's images */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgb(0 0 0 / 0.2);
	}
	.picker {
		position: fixed;
		top: 18vh;
		left: 50%;
		translate: -50% 0;
		z-index: 91;
		width: min(560px, 92vw);
		max-height: calc(100vh - 18vh - 8px);
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.cp {
		margin: 0;
		font-size: 16px;
	}
	.cgrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
		gap: 8px;
	}
	.cthumb {
		padding: 0;
		border: 1.5px solid var(--rule);
		border-radius: 8px;
		overflow: hidden;
		background: var(--ground);
		cursor: pointer;
	}
	.cthumb img {
		display: block;
		width: 100%;
		height: 72px;
		object-fit: cover;
	}
	.cthumb:hover {
		border-color: var(--ink);
	}
	/* icon row (DESIGN 2.1): 56 px emoji above the title; when empty a faint 13 px "Add icon" shows on hover */
	.pico {
		margin-bottom: 6px;
	}
	@media (hover: hover) and (min-width: 700px) {
		.pico.blank {
			opacity: 0;
		}
		.body:hover .pico.blank,
		.pico.blank:focus-within {
			opacity: 1;
		}
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
	.menu .narrow {
		display: none;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.bar .wide {
			display: none;
		}
		.menu .narrow {
			display: block;
		}
		.menu-wrap .menu button {
			min-height: 48px; /* beats the base 32 px rule below (#223) */
		}
		.crumbs a {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 48px;
			min-width: 48px;
		}
		.bar {
			padding: 10px 12px;
		}
		.body {
			padding: 20px 16px 32px;
		}
		.cover img {
			height: 120px;
		}
		.cover-acts {
			opacity: 1;
		}
		.cover-acts .btn {
			min-height: 48px;
		}
		.pico {
			margin-bottom: 2px;
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
		color: var(--pill-ink);
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
	/* Linked from (PR 20): under the editor, one row per source page */
	.linked {
		margin: 18px 0 4px;
		padding-top: 12px;
		border-top: 1px solid var(--rule);
		font-size: 13.5px;
	}
	.linked h2 {
		margin: 0 0 6px;
		font-size: 14px;
	}
	.linked h2 button {
		min-height: 24px;
		padding: 4px 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.linked ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.linked li {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.linked li.bl-arch {
		opacity: 0.6;
	}
	.linked .lt {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
		max-width: 45%;
		color: var(--ink);
		text-decoration: none;
	}
	.linked .lt:hover {
		text-decoration: underline;
	}
	.linked .tt {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.linked .snip {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--quiet);
	}
	.linked .snip b {
		color: var(--ink);
		font-weight: 600;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.linked h2 button {
			min-height: 48px;
		}
		.linked li {
			min-height: 48px;
			flex-wrap: wrap;
		}
		.linked .lt {
			min-height: 48px;
			max-width: 100%;
		}
	}
</style>
