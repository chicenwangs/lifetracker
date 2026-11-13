<!-- Keep note editor (FEATURES §5 K-NOTE, K-CHECK, K-IMG, K-LABEL, K-BINDER, K-PIN). Autosave ~600 ms + on close.
     A new note is only created once it has content; an empty one is simply dropped on close. -->
<script lang="ts">
	import Reminders from './Reminders.svelte';
	import ShareDialog from './ShareDialog.svelte';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { patch, post } from '$lib/client/api';
	import { enqueue, isOffline } from '$lib/client/offline';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import type { BinderDTO, ChecklistItem, LabelDTO, NoteDTO } from '$lib/types';

	let {
		note,
		labels,
		binders,
		colors,
		onclose,
		onchanged,
		shared,
	}: {
		/** null = new note */
		note: NoteDTO | null;
		labels: LabelDTO[];
		binders: BinderDTO[];
		colors: readonly string[];
		onclose: () => void;
		onchanged: () => void;
		/** someone else's note shared with me: edit = text + checklist only; view = read only */
		shared?: 'view' | 'edit';
	} = $props();
	let sharing = $state(false);

	// svelte-ignore state_referenced_locally
	const start = note;
	let id = $state(start?.id ?? null);
	let revision = $state(start?.revision ?? 0);
	let type = $state<'text' | 'checklist'>(start?.type ?? 'text');
	let title = $state(start?.title ?? '');
	let body = $state(start?.body ?? '');
	let color = $state<string | null>(start?.color ?? null);
	let pinned = $state(start?.pinned ?? false);
	let items = $state<(ChecklistItem & { open?: boolean })[]>(start?.items.map((i) => ({ ...i })) ?? []);
	let noteLabels = $state<string[]>(start?.labels ?? []);
	let noteBinders = $state<string[]>(start?.binders ?? []);
	let images = $state(start?.images ?? []);
	let saveState = $state<'idle' | 'saving' | 'saved' | 'failed' | 'offline'>('idle');
	const localKey = `new_${Math.random().toString(36).slice(2)}`; // a note made offline has no id yet
	let timer: ReturnType<typeof setTimeout> | null = null;
	let dirty = false;
	let saving: Promise<void> | null = null;
	let tmp = 0;

	const hasContent = () =>
		!!(title.trim() || body.trim() || items.some((i) => i.text.trim()) || images.length);
	const payload = () => shared ? { type, title, body, items: items.map(({ id, text, checked, parentId }) => ({ id, text, checked, parentId })) } : ({
		type,
		title,
		body,
		color: color as never,
		pinned,
		items: items.map(({ id, text, checked, parentId }) => ({ id, text, checked, parentId })),
		labels: noteLabels,
		binders: noteBinders,
		images: images.map((i) => i.id),
	}); // prettier-ignore

	function changed() {
		dirty = true;
		saveState = 'saving';
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, 600);
	}
	async function flush(): Promise<void> {
		if (timer) clearTimeout(timer);
		timer = null;
		if (saving) await saving; // one request at a time: never two creates
		if (!dirty) return;
		dirty = false;
		if (!id && !hasContent()) {
			saveState = 'idle';
			return;
		}
		saving = (async () => {
			try {
				const r = id
					? await patch<{ note: NoteDTO }>(`/api/keep/notes/${id}`, { ...payload(), revision })
					: await post<{ note: NoteDTO }>('/api/keep/notes', payload());
				id = r.note.id;
				revision = r.note.revision;
				// server ids for new checklist rows, kept in place so typing isn't disturbed
				items = items.map((it, i) => ({ ...it, id: r.note.items[i]?.id ?? it.id }));
				saveState = dirty ? 'saving' : 'saved';
				onchanged();
			} catch (e) {
				if (isOffline(e)) {
					// D-06: kept on this device, sent when back online (clash = both copies kept)
					enqueue({ key: id ?? localKey, noteId: id, revision, payload: payload() });
					saveState = 'offline';
					return;
				}
				saveState = 'failed'; // text stays in the editor; Retry or keep typing
				dirty = true;
				showError(e);
			} finally {
				saving = null;
			}
		})();
		await saving;
	}
	async function close() {
		await flush();
		if (saveState === 'failed' && !confirm('Saving failed. Close and lose the last changes?')) return;
		onclose();
	}

	// ---------- checklist ----------
	const depthOf = (i: number): number => {
		let d = 1;
		let p = items[i]?.parentId;
		while (p) {
			d++;
			p = items.find((x) => x.id === p)?.parentId ?? null;
		}
		return d;
	};
	const hiddenBy = (i: number): boolean => {
		let p = items[i]?.parentId;
		while (p) {
			const par = items.find((x) => x.id === p);
			if (par?.open === false) return true;
			p = par?.parentId ?? null;
		}
		return false;
	};
	const hasKids = (id: string) => items.some((x) => x.parentId === id);
	/** the item plus everything under it */
	const subtree = (i: number) => {
		let j = i + 1;
		const d = depthOf(i);
		while (j < items.length && depthOf(j) > d) j++;
		return [i, j] as const;
	};
	async function addItem(after = items.length - 1) {
		const parentId = after >= 0 ? (items[after]?.parentId ?? null) : null;
		const at = after >= 0 ? subtree(after)[1] : items.length;
		items.splice(at, 0, { id: `t${++tmp}`, text: '', checked: false, parentId });
		changed();
		await tick();
		(document.getElementById(`ci-${at}`) as HTMLInputElement | null)?.focus();
	}
	function indent(i: number, dir: 1 | -1) {
		const it = items[i];
		if (!it) return;
		if (dir === 1) {
			// becomes a child of the item above at the same level
			let k = i - 1;
			while (k >= 0 && depthOf(k) > depthOf(i)) k--;
			if (k < 0 || depthOf(k) !== depthOf(i)) return;
			let maxSub = 0;
			for (let j = i; j < subtree(i)[1]; j++) maxSub = Math.max(maxSub, depthOf(j) - depthOf(i) + 1);
			if (depthOf(i) + maxSub > 4)
				return showToast('Checklists nest 4 levels deep at most.', { kind: 'error' });
			it.parentId = items[k]?.id ?? null;
		} else {
			if (!it.parentId) return;
			it.parentId = items.find((x) => x.id === it.parentId)?.parentId ?? null;
		}
		changed();
	}
	function moveItem(i: number, dir: -1 | 1) {
		const [a, b] = subtree(i);
		const block = items.slice(a, b);
		const d = depthOf(i);
		// sibling to swap with
		let k = dir === -1 ? a - 1 : b;
		if (dir === -1) while (k >= 0 && depthOf(k) > d) k--;
		if (k < 0 || k >= items.length || depthOf(k) !== d || items[k]?.parentId !== items[i]?.parentId) return;
		const [ka, kb] = subtree(k);
		const other = items.slice(ka, kb);
		const lo = Math.min(a, ka);
		items.splice(
			lo,
			block.length + other.length,
			...(dir === -1 ? [...block, ...other] : [...other, ...block]),
		);
		changed();
	}
	function removeItem(i: number) {
		const [a, b] = subtree(i);
		items.splice(a, b - a);
		changed();
	}
	function toChecklist() {
		if (type === 'checklist') {
			body = items.map((i) => (i.checked ? '[x] ' : '') + i.text).join('\n');
			items = [];
			type = 'text';
		} else {
			items = body
				.split('\n')
				.filter((l) => l.trim())
				.map((l) => ({
					id: `t${++tmp}`,
					text: l.replace(/^\[x\] /, ''),
					checked: l.startsWith('[x] '),
					parentId: null,
				}));
			body = '';
			type = 'checklist';
		}
		changed();
	}

	// ---------- images ----------
	let limits: { maxBytes: number; types: string[] } | null = null;
	let uploading = $state(0);
	async function addImages(files: FileList | null) {
		if (!files?.length) return;
		limits ??= await fetch('/api/attachments').then((r) => r.json());
		for (const f of Array.from(files)) {
			const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? '').toLowerCase();
			if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
				showToast(`${f.name}: pick a png, jpg, gif or webp image.`, { kind: 'error' });
				continue;
			}
			if (limits && f.size > limits.maxBytes) {
				showToast(`${f.name} is too big (max ${Math.round(limits.maxBytes / 1048576)} MB).`, {
					kind: 'error',
				});
				continue;
			}
			uploading++;
			try {
				const r = await fetch(`/api/attachments?name=${encodeURIComponent(f.name)}`, {
					method: 'POST',
					headers: { 'content-type': f.type || 'application/octet-stream' },
					body: f,
				});
				const j = await r.json();
				if (!r.ok) throw new Error(j?.error?.message ?? 'Upload failed');
				images = [...images, j.attachment];
				changed();
			} catch (e) {
				showError(e); // note itself is kept; pick the file again to retry
			} finally {
				uploading--;
			}
		}
	}

	const toggle = (list: string[], v: string) =>
		list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	let newLabel = $state('');
	async function addLabel() {
		const name = newLabel.trim();
		if (!name) return;
		try {
			const r = await post<{ label: LabelDTO }>('/api/keep/labels', { name });
			labels = [...labels, r.label];
			noteLabels = [...noteLabels, r.label.id];
			newLabel = '';
			changed();
		} catch (e) {
			showError(e);
		}
	}
	async function act(p: { archived?: boolean; trashed?: boolean }, msg: string) {
		await flush();
		if (!id) return onclose();
		try {
			await patch(`/api/keep/notes/${id}`, p);
			const nid = id;
			showToast(msg, {
				undo: async () => {
					await patch(`/api/keep/notes/${nid}`, {
						archived: p.archived ? false : undefined,
						trashed: p.trashed ? false : undefined,
					});
					onchanged();
				},
			});
			onchanged();
			onclose();
		} catch (e) {
			showError(e);
		}
	}
	async function duplicate() {
		await flush();
		if (!id) return;
		try {
			await post(`/api/keep/notes/${id}/duplicate`);
			showToast('Copied');
			onchanged();
		} catch (e) {
			showError(e);
		}
	}
</script>

<div class="scrim" role="presentation" onclick={close}></div>
<div
	class="note card"
	role="dialog"
	aria-modal="true"
	aria-label={title || 'Note'}
	style:--note-bg={color ?? 'var(--card)'}
	class:tinted={!!color}
>
	{#if shared}<p class="hint">
			Shared with you · {shared === 'edit' ? 'you can edit the text' : 'view only'}
		</p>{/if}
	<fieldset class="plain" disabled={shared === 'view'}>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="title"
			placeholder="Title"
			bind:value={title}
			oninput={changed}
			maxlength="300"
			autofocus={!start}
		/>
		{#if type === 'text'}
			<textarea class="body" placeholder="Note" bind:value={body} oninput={changed} maxlength="20000" rows="6"
			></textarea>
		{:else}
			<ul class="items" aria-label="Checklist">
				{#each items as it, i (it.id)}
					{#if !hiddenBy(i)}
						<li style:padding-left="{(depthOf(i) - 1) * 22}px" class:done={it.checked}>
							{#if hasKids(it.id)}
								<button
									class="mini"
									type="button"
									aria-label="{it.open === false ? 'Expand' : 'Collapse'} {it.text}"
									aria-expanded={it.open !== false}
									onclick={() => (it.open = it.open === false)}>{it.open === false ? '▸' : '▾'}</button
								>
							{:else}<span class="mini sp"></span>{/if}
							<input
								type="checkbox"
								bind:checked={it.checked}
								onchange={changed}
								aria-label="Done: {it.text || 'item'}"
							/>
							<input
								id="ci-{i}"
								class="it"
								bind:value={it.text}
								oninput={changed}
								maxlength="1000"
								placeholder="List item"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addItem(i);
									} else if (e.key === 'Tab') {
										e.preventDefault();
										indent(i, e.shiftKey ? -1 : 1);
									} else if (e.key === 'Backspace' && !it.text && items.length > 1) {
										e.preventDefault();
										removeItem(i);
									}
								}}
							/>
							<span class="ops">
								<button
									class="mini"
									type="button"
									aria-label="Move {it.text} up"
									onclick={() => moveItem(i, -1)}>↑</button
								>
								<button
									class="mini"
									type="button"
									aria-label="Move {it.text} down"
									onclick={() => moveItem(i, 1)}>↓</button
								>
								<button class="mini" type="button" aria-label="Indent {it.text}" onclick={() => indent(i, 1)}
									>→</button
								>
								<button
									class="mini"
									type="button"
									aria-label="Outdent {it.text}"
									onclick={() => indent(i, -1)}>←</button
								>
								<button class="mini" type="button" aria-label="Delete {it.text}" onclick={() => removeItem(i)}
									>×</button
								>
							</span>
						</li>
					{/if}
				{/each}
			</ul>
			<button class="btn sm ghost" type="button" onclick={() => addItem()}>+ List item</button>
		{/if}
	</fieldset>

	{#if images.length || uploading}
		<div class="imgs">
			{#each images as im (im.id)}
				<figure>
					<a href={im.url} target="_blank" rel="noopener"><img src={im.url} alt={im.name} loading="lazy" /></a
					>
					{#if !shared}<button
							class="mini"
							type="button"
							aria-label="Remove {im.name}"
							onclick={() => ((images = images.filter((x) => x.id !== im.id)), changed())}>×</button
						>{/if}
				</figure>
			{/each}
			{#if uploading}<span class="hint">Uploading {uploading}…</span>{/if}
		</div>
	{/if}

	{#if !shared}
		<div class="chips" aria-label="Labels">
			{#each labels as l (l.id)}
				<button
					type="button"
					class="chip"
					aria-pressed={noteLabels.includes(l.id)}
					onclick={() => ((noteLabels = toggle(noteLabels, l.id)), changed())}>#{l.name}</button
				>
			{/each}
			<input
				class="newl"
				placeholder="+ label"
				bind:value={newLabel}
				maxlength="60"
				onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
				aria-label="New label"
			/>
		</div>
		{#if binders.length}
			<div class="chips" aria-label="Binders">
				{#each binders as b (b.id)}
					<button
						type="button"
						class="chip bd"
						aria-pressed={noteBinders.includes(b.id)}
						onclick={() => ((noteBinders = toggle(noteBinders, b.id)), changed())}>▣ {b.name}</button
					>
				{/each}
			</div>
		{/if}
	{/if}
	<div class="bar">
		{#if !shared}
			<div class="colors" role="radiogroup" aria-label="Colour">
				<button
					type="button"
					role="radio"
					class="sw"
					aria-checked={color === null}
					aria-label="No colour"
					style:background="var(--card)"
					onclick={() => ((color = null), changed())}
				></button>
				{#each colors as c (c)}
					<button
						type="button"
						role="radio"
						class="sw"
						aria-checked={color === c}
						aria-label="Colour {c}"
						style:background={c}
						onclick={() => ((color = c), changed())}
					></button>
				{/each}
			</div>
			<button
				class="mini wide"
				type="button"
				aria-pressed={pinned}
				onclick={() => ((pinned = !pinned), changed())}>{pinned ? 'Pinned' : 'Pin'}</button
			>
		{/if}
		{#if shared !== 'view'}<button class="mini wide" type="button" onclick={toChecklist}
				>{type === 'checklist' ? 'Plain text' : 'Checklist'}</button
			>{/if}
		{#if !shared}
			<label class="mini wide file"
				>Image<input
					type="file"
					accept="image/png,image/jpeg,image/gif,image/webp"
					multiple
					onchange={(e) => addImages(e.currentTarget.files)}
				/></label
			>
			{#if start}
				<button class="mini wide" type="button" onclick={() => (sharing = true)}>Share…</button>
				<button class="mini wide" type="button" onclick={duplicate}>Duplicate</button>
				<button
					class="mini wide"
					type="button"
					onclick={() => act({ archived: !start.archived }, start.archived ? 'Unarchived' : 'Note archived')}
					>{start.archived ? 'Unarchive' : 'Archive'}</button
				>
				<button class="mini wide" type="button" onclick={() => act({ trashed: true }, 'Moved to Trash')}
					>Delete</button
				>
			{/if}
		{/if}
		<span class="state" role="status">
			{#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}Saved{:else if saveState === 'offline'}Offline
				· kept on this device, sends when you're back{:else if saveState === 'failed'}<button
					class="mini wide"
					type="button"
					onclick={() => ((dirty = true), flush())}>Save failed · Retry</button
				>{/if}
		</span>
		<button class="btn sm" type="button" onclick={close} title="Esc">Close</button>
	</div>
	{#if sharing && id}<ShareDialog kind="note" {id} name={title} onclose={() => (sharing = false)} />{/if}
	{#if id && !shared}<Reminders
			source="keep_note"
			sourceId={id}
			tz={page.data.user?.timezone ?? 'Asia/Kuala_Lumpur'}
			relative={false}
		/>{/if}
	{#if start}<span class="hint"
			>Edited {new Date(start.updatedAt).toLocaleString()} · Created {new Date(
				start.createdAt,
			).toLocaleDateString()}</span
		>{/if}
</div>
<svelte:window
	onkeydown={(e) => e.key === 'Escape' && close()}
	onbeforeunload={(e) => (dirty || saving) && e.preventDefault()}
/>

<style>
	.plain {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: contents;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgb(0 0 0 / 0.3);
	}
	.note {
		position: fixed;
		top: 8vh;
		left: 50%;
		translate: -50% 0;
		z-index: 71;
		width: min(620px, 94vw);
		max-height: 84vh;
		overflow: auto;
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		background: var(--note-bg);
	}
	.note.tinted {
		color: #00003d;
	}
	.title,
	.body,
	.it,
	.newl {
		font: inherit;
		border: 0;
		background: transparent;
		color: inherit;
		outline-offset: 2px;
	}
	.title {
		font-size: 18px;
		font-weight: 600;
	}
	.body {
		resize: vertical;
		min-height: 120px;
		font-size: 14px;
		line-height: 1.5;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.items li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.items li.done .it {
		text-decoration: line-through;
		opacity: 0.7;
	}
	.it {
		flex: 1;
		min-width: 0;
		font-size: 14px;
	}
	.ops {
		display: flex;
		gap: 2px;
		opacity: 0;
	}
	li:hover .ops,
	li:focus-within .ops {
		opacity: 1;
	}
	@media (hover: none) {
		.ops {
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
	.mini.sp {
		border: 0;
		display: inline-block;
	}
	.mini.wide {
		padding: 0 8px;
	}
	.mini[aria-pressed='true'] {
		background: var(--ink);
		color: var(--card);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.chip {
		min-height: 24px;
		padding: 0 10px;
		border-radius: 999px;
		border: 1px solid #6b6b8f;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		background: var(--ink);
		color: var(--card);
		border-color: var(--ink);
	}
	.newl {
		font-size: 12px;
		width: 90px;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.colors {
		display: flex;
		gap: 4px;
	}
	.sw {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1.5px solid var(--rule);
		cursor: pointer;
	}
	.sw[aria-checked='true'] {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
	.file input {
		display: none;
	}
	.file {
		display: inline-flex;
		align-items: center;
	}
	.state {
		margin-left: auto;
		font-size: 12px;
		color: var(--muted);
	}
	.imgs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	figure {
		margin: 0;
		position: relative;
	}
	figure img {
		max-width: 180px;
		max-height: 140px;
		border-radius: 8px;
		display: block;
	}
	figure .mini {
		position: absolute;
		top: 4px;
		right: 4px;
		background: var(--card);
	}
	@media (max-width: 699px) {
		.note {
			top: 0;
			left: 0;
			translate: none;
			width: 100vw;
			height: 100dvh;
			max-height: none;
			border-radius: 0;
		}
	}
</style>
