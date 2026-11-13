<!-- Pages editor (FEATURES §6 PG-EDIT/BLOCKS/SLASH/MOVE/INLINE/TABLE/LINK). Tiptap is not $state: created in
     onMount, destroyed on teardown (ADR-002). Autosave ~600 ms after the last change; failed save keeps the text. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Editor, type Content } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { TableKit } from '@tiptap/extension-table';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import Image from '@tiptap/extension-image';
	import { patch, get, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { BlockKeys, DatabaseBlock, PageLink, Slash, blockOps, type SlashItem } from './extensions.svelte';
	import type { PageDTO } from '$lib/types';

	let {
		page,
		onsaved,
		onstate,
	}: {
		page: PageDTO;
		onsaved?: (p: PageDTO) => void;
		onstate?: (s: 'saving' | 'saved' | 'failed' | 'conflict') => void;
	} = $props();

	let el: HTMLDivElement | undefined = $state();
	let editor: Editor | null = null;
	let revision = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending = false;
	let inTable = $state(false);
	let marks = $state<Record<string, boolean>>({});

	// ---------- "/" menu ----------
	let picker = $state<{
		q: string;
		hits: { id: string; title: string; archived: number }[];
		at: number;
	} | null>(null);
	const ITEMS: SlashItem[] = [
		{ title: 'Text', run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
		{ title: 'Heading 1', hint: '#', run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 1 }).run() },
		{ title: 'Heading 2', hint: '##', run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run() },
		{ title: 'Heading 3', hint: '###', run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run() },
		{ title: 'Bullet list', hint: '-', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
		{ title: 'Numbered list', hint: '1.', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
		{ title: 'To-do list', hint: '[]', run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
		{ title: 'Divider', hint: '---', run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
		{ title: 'Table', run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
		{ title: 'Quote', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
		{ title: 'Code', run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
		{ title: 'Database', hint: 'table of records', run: (e, r) => { e.chain().focus().deleteRange(r).run(); void addDatabase(); } },
		{ title: 'Link to page', hint: 'internal', run: (e, r) => { e.chain().focus().deleteRange(r).run(); picker = { q: '', hits: [], at: e.state.selection.from }; void findPages(''); } },
		{ title: 'Image', hint: 'upload', run: (e, r) => { e.chain().focus().deleteRange(r).run(); pickFile('image'); } },
		{ title: 'File', hint: 'upload', run: (e, r) => { e.chain().focus().deleteRange(r).run(); pickFile('file'); } },
	]; // prettier-ignore
	const items = (q: string) =>
		ITEMS.filter((i) => i.title.toLowerCase().includes(q.toLowerCase())).slice(0, 14);

	async function addDatabase() {
		try {
			const r = await post<{ database: { id: string } }>('/api/databases', { pageId: page.id });
			editor
				?.chain()
				.focus()
				.insertContent({ type: 'database', attrs: { databaseId: r.database.id } })
				.run();
		} catch (e) {
			showError(e);
		}
	}
	async function findPages(q: string) {
		try {
			const r = await get<{ hits: { id: string; title: string; archived: number }[] }>(
				`/api/pages/find?q=${encodeURIComponent(q)}`,
			);
			if (picker) picker.hits = r.hits.filter((h) => h.id !== page.id);
		} catch (e) {
			showError(e);
		}
	}
	function insertLink(h: { id: string; title: string; archived: number }) {
		if (!editor || !picker) return;
		(editor.storage as unknown as { pageLink: { titles: PageDTO['links'] } }).pageLink.titles[h.id] = {
			title: h.title,
			archived: !!h.archived,
		};
		editor
			.chain()
			.focus()
			.insertContentAt(picker.at, [
				{ type: 'pageLink', attrs: { pageId: h.id } },
				{ type: 'text', text: ' ' },
			])
			.run();
		picker = null;
	}

	// ---------- uploads ----------
	let fileInput: HTMLInputElement | undefined = $state();
	let fileKind: 'image' | 'file' = 'image';
	function pickFile(k: 'image' | 'file') {
		fileKind = k;
		if (fileInput) {
			fileInput.accept = k === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : '';
			fileInput.click();
		}
	}
	async function upload(f: File) {
		const lim = await fetch('/api/attachments').then((r) => r.json());
		if (f.size > lim.maxBytes) return showToast(`${f.name} is too big (max ${Math.round(lim.maxBytes / 1048576)} MB).`, { kind: 'error' });
		const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? '').toLowerCase();
		if (!lim.types.includes(ext)) return showToast(`${f.name}: this file type isn't allowed.`, { kind: 'error' });
		const r = await fetch(`/api/attachments?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f });
		const j = await r.json();
		if (!r.ok) throw new Error(j?.error?.message ?? 'Upload failed');
		if (!editor) return;
		if (fileKind === 'image') {
			const alt = prompt('Describe the image (alt text, required)', f.name.replace(/\.[^.]+$/, ''))?.trim();
			if (!alt) return showToast('Image not added: it needs a description.', { kind: 'error' });
			editor.chain().focus().setImage({ src: j.attachment.url, alt }).run();
		} else {
			editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: `📎 ${f.name}`, marks: [{ type: 'link', attrs: { href: j.attachment.url } }] }] }).run();
		}
	} // prettier-ignore

	// ---------- save ----------
	function changed() {
		pending = true;
		onstate?.('saving');
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, 600);
	}
	let inflight: Promise<void> | null = null;
	export async function flush(): Promise<void> {
		if (timer) clearTimeout(timer);
		timer = null;
		if (inflight) await inflight;
		if (!pending || !editor) return;
		pending = false;
		const doc = editor.getJSON();
		inflight = (async () => {
			try {
				const r = await patch<{ page: PageDTO }>(`/api/pages/${page.id}`, { doc, revision });
				revision = r.page.revision;
				onstate?.(pending ? 'saving' : 'saved');
				onsaved?.(r.page);
			} catch (e) {
				pending = true; // text stays here; next change or Retry tries again
				const conflict = (e as { status?: number }).status === 409;
				onstate?.(conflict ? 'conflict' : 'failed');
				showError(e);
			} finally {
				inflight = null;
			}
		})();
		await inflight;
	}
	export const setRevision = (r: number) => (revision = r);
	export const retry = () => ((pending = true), flush());
	export const dirty = () => pending || !!inflight;

	onMount(() => {
		revision = page.revision;
		const ed = new Editor({
			element: el,
			extensions: [
				StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } } }),
				TableKit.configure({ table: { resizable: false } }),
				TaskList,
				TaskItem.configure({ nested: true }),
				Image.configure({ inline: false }),
				PageLink.configure({ titles: page.links }),
				DatabaseBlock,
				BlockKeys,
				Slash.configure({ items }),
			],
			content: (page.doc.content.length ? page.doc : { type: 'doc', content: [{ type: 'paragraph' }] }) as Content,
			editable: page.access !== 'view',
			editorProps: { attributes: { 'aria-label': 'Page content', class: 'pm' } },
			onUpdate: changed,
			onSelectionUpdate: ({ editor: e }) => {
				inTable = e.isActive('table');
				marks = { bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), code: e.isActive('code'), link: e.isActive('link') };
			},
		}); // prettier-ignore
		// internal links open in the app
		ed.view.dom.addEventListener('click', (ev) => {
			const a = (ev.target as HTMLElement).closest('a.pl[href]') as HTMLAnchorElement | null;
			if (a) {
				ev.preventDefault();
				location.href = a.href;
			}
		});
		editor = ed;
		return () => {
			if (pending) void flush();
			ed.destroy();
			editor = null;
		};
	});

	const cmd = (f: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
		editor && f(editor.chain().focus()).run();
	function setLink() {
		if (!editor) return;
		if (editor.isActive('link')) return cmd((c) => c.unsetLink());
		const href = prompt('Link address (https://…)')?.trim();
		if (!href) return;
		if (!/^(https?:\/\/|mailto:)/i.test(href))
			return showToast('Links must start with https://, http:// or mailto:', { kind: 'error' });
		cmd((c) => c.extendMarkRange('link').setLink({ href }));
	}
	const op = (f: keyof typeof blockOps) => editor && (f === 'move' ? null : blockOps[f](editor.view));
</script>

<div class="tools" role="toolbar" aria-label="Formatting and block tools">
	<button
		type="button"
		class="t"
		aria-pressed={marks.bold}
		title="Bold (Ctrl+B)"
		onclick={() => cmd((c) => c.toggleBold())}><b>B</b></button
	>
	<button
		type="button"
		class="t"
		aria-pressed={marks.italic}
		title="Italic (Ctrl+I)"
		onclick={() => cmd((c) => c.toggleItalic())}><i>I</i></button
	>
	<button
		type="button"
		class="t"
		aria-pressed={marks.underline}
		title="Underline (Ctrl+U)"
		onclick={() => cmd((c) => c.toggleUnderline())}><u>U</u></button
	>
	<button
		type="button"
		class="t"
		aria-pressed={marks.strike}
		title="Strike"
		onclick={() => cmd((c) => c.toggleStrike())}><s>S</s></button
	>
	<button
		type="button"
		class="t"
		aria-pressed={marks.code}
		title="Inline code"
		onclick={() => cmd((c) => c.toggleCode())}>&lt;/&gt;</button
	>
	<button type="button" class="t" aria-pressed={marks.link} title="Link" onclick={setLink}>Link</button>
	<span class="sep"></span>
	<button
		type="button"
		class="t"
		title="Move block up (Alt+↑)"
		aria-label="Move block up"
		onclick={() => editor && blockOps.move(editor.view, -1)}>↑</button
	>
	<button
		type="button"
		class="t"
		title="Move block down (Alt+↓)"
		aria-label="Move block down"
		onclick={() => editor && blockOps.move(editor.view, 1)}>↓</button
	>
	<button type="button" class="t" title="Duplicate block" onclick={() => op('duplicate')}>Duplicate</button>
	<button type="button" class="t" title="Delete block" onclick={() => op('remove')}>Delete block</button>
	{#if inTable}
		<span class="sep"></span>
		<button type="button" class="t" onclick={() => cmd((c) => c.addRowAfter())}>+ Row</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.addColumnAfter())}>+ Col</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.deleteRow())}>− Row</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.deleteColumn())}>− Col</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.deleteTable())}>Delete table</button>
	{/if}
	<span class="hint">Type / for blocks</span>
</div>
<div class="doc" bind:this={el}></div>
<input
	class="sr-only"
	type="file"
	bind:this={fileInput}
	onchange={async (e) => {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (f) await upload(f).catch(showError);
	}}
/>

{#if picker}
	<div class="scrim" role="presentation" onclick={() => (picker = null)}></div>
	<div class="picker card" role="dialog" aria-modal="true" aria-label="Link to page">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			placeholder="Search your pages"
			aria-label="Search your pages"
			autofocus
			bind:value={picker.q}
			oninput={() => picker && findPages(picker.q)}
			onkeydown={(e) => {
				if (e.key === 'Escape') picker = null;
				if (e.key === 'Enter' && picker?.hits[0]) insertLink(picker.hits[0]);
			}}
		/>
		{#each picker.hits as h (h.id)}
			<button type="button" onclick={() => insertLink(h)}
				>{h.title || 'Untitled'}{#if h.archived}
					<span class="hint">archived</span>{/if}</button
			>
		{:else}<span class="hint">No pages match.</span>{/each}
	</div>
{/if}

<style>
	.tools {
		position: sticky;
		top: 64px;
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
		padding: 6px 0;
		background: var(--card);
	}
	.t {
		min-width: 28px;
		min-height: 28px;
		padding: 0 8px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.t[aria-pressed='true'] {
		background: var(--ink);
		color: var(--card);
	}
	.sep {
		width: 1px;
		height: 20px;
		background: var(--rule);
		margin: 0 4px;
	}
	.tools .hint {
		margin-left: auto;
	}
	.doc :global(.pm) {
		outline: none;
		min-height: 50vh;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ink);
	}
	.doc :global(.pm p.is-empty:first-child::before),
	.doc :global(.pm > p:only-child:empty::before) {
		content: 'Type / to add a block';
		color: var(--muted);
		pointer-events: none;
		float: left;
		height: 0;
	}
	.doc :global(table) {
		border-collapse: collapse;
		margin: 8px 0;
	}
	.doc :global(td),
	.doc :global(th) {
		border: 1px solid var(--ink);
		padding: 4px 8px;
		min-width: 60px;
		vertical-align: top;
	}
	.doc :global(ul[data-type='taskList']) {
		list-style: none;
		padding-left: 4px;
	}
	.doc :global(ul[data-type='taskList'] li) {
		display: flex;
		gap: 8px;
	}
	.doc :global(img) {
		max-width: 100%;
		border-radius: 8px;
	}
	.doc :global(a.pl) {
		padding: 0 4px;
		border-radius: 4px;
		background: var(--pill);
		color: var(--ink);
		text-decoration: none;
	}
	.doc :global(a.pl.arch) {
		font-style: italic;
	}
	.doc :global(a.pl.gone) {
		opacity: 0.6;
		text-decoration: line-through;
	}
	.doc :global(blockquote) {
		border-left: 3px solid var(--rule);
		margin-left: 0;
		padding-left: 12px;
	}
	.doc :global(pre) {
		background: var(--pill);
		padding: 8px 12px;
		border-radius: 8px;
		overflow-x: auto;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgb(0 0 0 / 0.2);
	}
	.picker {
		position: fixed;
		top: 20vh;
		left: 50%;
		translate: -50% 0;
		z-index: 91;
		width: min(420px, 92vw);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.picker input {
		min-height: 36px;
		padding: 0 10px;
		font: inherit;
		border-radius: 8px;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--ink);
	}
	.picker button {
		text-align: left;
		min-height: 32px;
		padding: 0 8px;
		background: none;
		border: 0;
		border-radius: 6px;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.picker button:hover {
		background: var(--pill);
	}
</style>
