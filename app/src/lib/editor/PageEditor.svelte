<!-- Pages editor (FEATURES §6 PG-EDIT/BLOCKS/SLASH/MOVE/INLINE/TABLE/LINK). Tiptap is not $state: created in
     onMount, destroyed on teardown (ADR-002). Autosave ~600 ms after the last change; failed save keeps the text. -->
<script lang="ts">
	import { askText } from '$lib/client/dialog.svelte';
	import { backCloses } from '$lib/client/layers';
	import { modal } from '$lib/client/modal';
	import { isPhone } from '$lib/client/phone';
	import ActionSheet from '$lib/components/ActionSheet.svelte';
	import { onMount } from 'svelte';
	import { Editor, type Content } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { TableKit } from '@tiptap/extension-table';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import Image from '@tiptap/extension-image';
	import { patch, get, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import {
		BlockKeys,
		Callout,
		DatabaseBlock,
		PageLink,
		Slash,
		Toc,
		Toggle,
		blockOps,
		type SlashItem,
	} from './extensions.svelte';
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
		hits: { id: string; title: string; archived: number; icon: string | null }[];
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
		{ title: 'Callout', hint: 'Highlight a note', run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: 'callout', attrs: { tone: 'grey', emoji: '💡' }, content: [{ type: 'paragraph' }] }).run() },
		{ title: 'Toggle', hint: 'Hide details under a line', run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: 'toggle', attrs: { open: true }, content: [{ type: 'paragraph' }] }).run() },
		{ title: 'Table of contents', hint: "List this page's headings", run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: 'toc' }).run() },
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
			const r = await get<{ hits: { id: string; title: string; archived: number; icon: string | null }[] }>(
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
			const alt = await askText('Describe the image (alt text, required)', { value: f.name.replace(/\.[^.]+$/, ''), ok: 'Add image' }); // prettier-ignore
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
				Callout,
				Toggle,
				Toc,
				BlockKeys,
				Slash.configure({ items }),
			],
			content: (page.doc.content.length ? page.doc : { type: 'doc', content: [{ type: 'paragraph' }] }) as Content,
			editable: page.access !== 'view',
			editorProps: { attributes: { 'aria-label': 'Page content', class: 'pm' } },
			onUpdate: changed,
			onTransaction: ({ editor: e }) => {
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
		// Ctrl+Z / Ctrl+Y on a page = this page's undo, even after a toolbar click took focus out of the text
		// (the app-wide undo would otherwise undo the last planner action instead)
		const keys = (e: KeyboardEvent) => {
			const k = e.key.toLowerCase();
			if (!(e.ctrlKey || e.metaKey) || e.altKey || (k !== 'z' && k !== 'y') || !ed.isEditable) return;
			const t = e.target as HTMLElement;
			if (ed.view.dom.contains(t) || t.closest?.('input, textarea, select, [contenteditable]')) return;
			if (document.querySelector('[aria-modal="true"]')) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const c = ed.chain().focus();
			(k === 'y' || e.shiftKey ? c.redo() : c.undo()).run();
		};
		addEventListener('keydown', keys, true);
		return () => {
			removeEventListener('keydown', keys, true);
			if (pending) void flush();
			ed.destroy();
			editor = null;
		};
	});

	const cmd = (f: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
		editor && f(editor.chain().focus()).run();
	async function setLink() {
		if (!editor) return;
		if (editor.isActive('link')) return cmd((c) => c.unsetLink());
		const href = await askText('Link address (https://…)', { ok: 'Add link' });
		if (!href) return;
		if (!/^(https?:\/\/|mailto:)/i.test(href))
			return showToast('Links must start with https://, http:// or mailto:', { kind: 'error' });
		cmd((c) => c.extendMarkRange('link').setLink({ href }));
	}
	const op = (f: keyof typeof blockOps) => editor && (f === 'move' ? null : blockOps[f](editor.view));
	// phone (#98): toolbar docks above the keyboard only while typing; block actions in one sheet
	let phone = $state(false);
	let typing = $state(false);
	let blockMenu = $state(false);
	/** #433: height of the phone tab bar, so the docked toolbar sits above it (0 on desktop / hidden bar) */
	let barH = $state(0);
	onMount(() => {
		phone = isPhone();
		const dom = el?.querySelector('.pm');
		const on = () => (typing = true);
		const off = (e: Event) => {
			const to = (e as FocusEvent).relatedTarget as HTMLElement | null;
			// microtask: removing the focused editor fires focusout inside Svelte's teardown, where state writes throw (#297)
			if (!to?.closest('.tools')) queueMicrotask(() => (typing = false));
		};
		dom?.addEventListener('focusin', on);
		dom?.addEventListener('focusout', off);
		const bar = document.querySelector<HTMLElement>('nav.mbar');
		const measure = () => {
			barH = bar && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
		};
		measure();
		addEventListener('resize', measure);
		visualViewport?.addEventListener('resize', measure);
		return () => {
			dom?.removeEventListener('focusin', on);
			dom?.removeEventListener('focusout', off);
			removeEventListener('resize', measure);
			visualViewport?.removeEventListener('resize', measure);
		};
	});
</script>

<!-- mousedown kept off the buttons so the text keeps focus + selection (Ctrl+Z still undoes in the page) -->
<div
	class="tools"
	class:typing
	role="toolbar"
	tabindex="-1"
	aria-label="Formatting and block tools"
	style:--bar-h="{barH}px"
	onmousedown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}
>
	<button
		type="button"
		class="t"
		aria-pressed={marks.bold}
		aria-label="Bold"
		title={phone ? undefined : 'Bold (Ctrl+B)'}
		onclick={() => cmd((c) => c.toggleBold())}><b>B</b></button
	>
	<button
		type="button"
		class="t"
		aria-pressed={marks.italic}
		aria-label="Italic"
		title={phone ? undefined : 'Italic (Ctrl+I)'}
		onclick={() => cmd((c) => c.toggleItalic())}><i>I</i></button
	>
	<button
		type="button"
		class="t"
		aria-pressed={marks.underline}
		aria-label="Underline"
		title={phone ? undefined : 'Underline (Ctrl+U)'}
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
	<button type="button" class="t ph" aria-label="Block actions" onclick={() => (blockMenu = true)}>⋯</button>
	<button
		type="button"
		class="t desk"
		title="Move block up (Alt+↑)"
		aria-label="Move block up"
		onclick={() => editor && blockOps.move(editor.view, -1)}>↑</button
	>
	<button
		type="button"
		class="t desk"
		title="Move block down (Alt+↓)"
		aria-label="Move block down"
		onclick={() => editor && blockOps.move(editor.view, 1)}>↓</button
	>
	<button type="button" class="t desk" title="Duplicate block" onclick={() => op('duplicate')}
		>Duplicate</button
	>
	<button type="button" class="t desk" title="Delete block" onclick={() => op('remove')}>Delete block</button>
	{#if inTable}
		<span class="sep"></span>
		<button type="button" class="t" onclick={() => cmd((c) => c.addRowAfter())}>+ Row</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.addColumnAfter())}>+ Col</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.deleteRow())}>− Row</button>
		<button type="button" class="t" onclick={() => cmd((c) => c.deleteColumn())}>− Col</button>
	{:else}
		<span class="hint desk">Type / for blocks</span>
	{/if}
</div>
<div class="doc" bind:this={el} style:--bar-h="{barH}px"></div>
<input
	class="sr-only"
	type="file"
	aria-label="Insert image or file"
	bind:this={fileInput}
	onchange={async (e) => {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (f) await upload(f).catch(showError);
	}}
/>

{#if blockMenu}
	{@const run = (f: () => unknown) => () => (f(), editor?.commands.focus())}
	<ActionSheet
		title="Block"
		actions={[
			{ label: 'Move up', run: run(() => editor && blockOps.move(editor.view, -1)) },
			{ label: 'Move down', run: run(() => editor && blockOps.move(editor.view, 1)) },
			{ label: 'Duplicate', run: run(() => op('duplicate')) },
			{ label: 'Delete block', danger: true, run: run(() => op('remove')) },
		]}
		onclose={() => (blockMenu = false)}
	/>
{/if}
{#if picker}
	<div class="scrim" role="presentation" onclick={() => (picker = null)}></div>
	<div
		use:backCloses={() => (picker = null)}
		use:modal={() => (picker = null)}
		class="picker card"
		role="dialog"
		aria-modal="true"
		aria-label="Link to page"
	>
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
				>{h.icon ? `${h.icon} ` : ''}{h.title || 'Untitled'}{#if h.archived}
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
		gap: 2px;
		align-items: center;
		margin: 0 -8px 12px;
		padding: 4px;
		border-radius: 10px;
		background: var(--ground);
	}
	.t {
		min-width: 28px;
		min-height: 28px;
		padding: 0 8px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.ph {
		display: none;
	}
	/* PR 18: callout, toggle, TOC node views (plain DOM from the extensions, so global) */
	:global(.pm .co) {
		--co-bg: #f3f2fa;
		--co-bar: #6b6b8f;
		position: relative;
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr);
		gap: 2px 8px;
		margin: 8px 0;
		padding: 10px 12px 10px 10px;
		border-radius: 10px;
		border-left: 3px solid var(--co-bar);
		background: var(--co-bg);
	}
	:global(.pm .co[data-tone='blue']) {
		--co-bg: #e3ecf7;
		--co-bar: #2f5e8e;
	}
	:global(.pm .co[data-tone='yellow']) {
		--co-bg: #faedb8;
		--co-bar: #8a6d00;
	}
	:global(.pm .co[data-tone='red']) {
		--co-bg: #fbe3e1;
		--co-bar: #a83a35;
	}
	:global(:root[data-theme='dark'] .pm .co) {
		--co-bg: #201f48;
		--co-bar: #8e8bb5;
	}
	:global(:root[data-theme='dark'] .pm .co[data-tone='blue']) {
		--co-bg: #16304a;
		--co-bar: #8db4da;
	}
	:global(:root[data-theme='dark'] .pm .co[data-tone='yellow']) {
		--co-bg: #3a3416;
		--co-bar: #f3d053;
	}
	:global(:root[data-theme='dark'] .pm .co[data-tone='red']) {
		--co-bg: #4a1f1d;
		--co-bar: #f2a19c;
	}
	:global(.pm .co-ico) {
		grid-column: 1;
		grid-row: 1;
	}
	:global(.pm .co-body) {
		grid-column: 2;
		min-width: 0;
	}
	:global(.pm .co-body > :first-child) {
		margin-top: 0;
	}
	:global(.pm .co-body > :last-child) {
		margin-bottom: 0;
	}
	:global(.pm .co-tones) {
		position: absolute;
		right: 8px;
		bottom: 5px;
		display: flex;
		gap: 3px;
		opacity: 0;
		transition: opacity 120ms var(--ease);
	}
	:global(.pm .co:hover .co-tones),
	:global(.pm .co:focus-within .co-tones) {
		opacity: 1;
	}
	:global(.pm .co-tone) {
		width: 12px;
		height: 12px;
		padding: 0;
		border: 1px solid rgb(0 0 0 / 0.25);
		border-radius: 50%;
		cursor: pointer;
	}
	:global(.pm .co-tone[data-tone='grey']) {
		background: #6b6b8f;
	}
	:global(.pm .co-tone[data-tone='blue']) {
		background: #2f5e8e;
	}
	:global(.pm .co-tone[data-tone='yellow']) {
		background: #8a6d00;
	}
	:global(.pm .co-tone[data-tone='red']) {
		background: #a83a35;
	}
	:global(.pm .tg) {
		position: relative;
		margin: 6px 0;
		padding-left: 30px;
	}
	:global(.pm .tg-btn) {
		position: absolute;
		left: 0;
		top: 1px;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--quiet);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	:global(.pm .tg-btn::before) {
		content: '▸';
		display: inline-block;
		transition: transform 120ms var(--ease);
	}
	:global(.pm .tg[data-open='true'] .tg-btn::before) {
		transform: rotate(90deg);
	}
	:global(.pm .tg-btn:hover) {
		background: var(--hover);
		color: var(--ink);
	}
	:global(.pm .tg-body) {
		padding-left: 24px;
	}
	:global(.pm .tg[data-open='false'] .tg-body > *:not(:first-child)) {
		display: none;
	}
	:global(.pm .tg[data-empty='true'][data-open='true'] .tg-body::after) {
		content: 'Empty toggle. Type or drop blocks inside.';
		color: var(--faint);
		font-size: 13px;
	}
	:global(.pm .toc) {
		margin: 10px 0;
		padding: 12px 14px;
		border-radius: 10px;
		background: var(--ground);
	}
	:global(.pm .toc-title) {
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--quiet);
	}
	:global(.pm .toc-row) {
		display: block;
		min-height: 24px;
		width: 100%;
		padding: 0;
		text-align: left;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		cursor: pointer;
	}
	:global(.pm .toc-row[data-level='1']) {
		padding-left: 0;
		font-weight: 600;
	}
	:global(.pm .toc-row[data-level='2']) {
		padding-left: 16px;
	}
	:global(.pm .toc-row[data-level='3']) {
		padding-left: 32px;
	}
	:global(.pm .toc-row:hover) {
		background: var(--hover);
	}
	:global(.pm .toc-empty) {
		font-size: 13px;
		color: var(--faint);
	}
	/* phone (#98): 48 dp, one scrolling row docked above the tab bar (and so above the keyboard when it is up,
	   #433) while typing, gone otherwise */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		:global(.pm .tg-btn) {
			width: 48px;
			height: 48px;
			top: -10px;
			font-size: 18px;
		}
		:global(.pm .tg) {
			padding-left: 52px;
		}
		:global(.pm .tg-body) {
			padding-left: 0;
		}
		:global(.pm .co-tones) {
			opacity: 1;
		}
		:global(.pm .co-tone) {
			width: 24px;
			height: 24px;
		}
		.t {
			min-width: 48px;
			min-height: 48px;
			flex: none;
		}
		.desk {
			display: none !important;
		}
		.ph {
			display: inline-block;
		}
		.tools {
			display: none;
		}
		.tools.typing {
			display: flex;
			position: fixed;
			left: 0;
			right: 0;
			bottom: var(--bar-h, 0px); /* #433: above the phone tab bar (the bar sits at the keyboard's top) */
			top: auto;
			z-index: 60;
			margin: 0;
			padding: 0 calc(4px + env(safe-area-inset-right)) env(safe-area-inset-bottom)
				calc(4px + env(safe-area-inset-left));
			border-radius: 0;
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			background: var(--card);
			border-top: 1.5px solid var(--rule);
		}
		.tools.typing::-webkit-scrollbar {
			display: none;
		}
		.doc {
			padding-bottom: calc(64px + var(--bar-h, 0px)); /* last line clears the docked toolbar + the tab bar */
		}
		/* div.picker beats the base 36 / 32 px rules further down (#223) */
		div.picker input,
		div.picker button {
			min-height: 48px;
		}
		/* 22 px box, 48 dp to tap */
		.doc :global(ul[data-type='taskList'] li > label) {
			position: relative;
		}
		.doc :global(ul[data-type='taskList'] li > label::after) {
			content: '';
			position: absolute;
			inset: -12px;
		}
		.doc :global(ul[data-type='taskList'] input) {
			width: 22px;
			height: 22px;
		}
	}
	.t:hover {
		background: var(--card);
	}
	.t[aria-pressed='true'] {
		background: var(--ink);
		color: var(--card);
	}
	.sep {
		width: 1px;
		height: 18px;
		background: var(--rule);
		margin: 0 4px;
	}
	.tools .hint {
		margin-left: auto;
		padding-right: 6px;
	}
	.doc :global(.pm) {
		outline: none;
		min-height: 50vh;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ink);
	}
	/* desktop: bigger text (owner 2026-11-16: had to squint) */
	@media (min-width: 1024px) {
		.doc :global(.pm) {
			font-size: 17px;
		}
	}
	.doc :global(.pm > *) {
		margin: 3px 0;
	}
	.doc :global(.pm p) {
		margin: 3px 0;
	}
	.doc :global(.pm h1) {
		font-size: 26px;
		margin: 18px 0 6px;
	}
	.doc :global(.pm h2) {
		font-size: 21px;
		margin: 14px 0 4px;
	}
	.doc :global(.pm h3) {
		font-size: 17px;
		margin: 12px 0 4px;
	}
	.doc :global(.pm > :first-child) {
		margin-top: 0;
	}
	.doc :global(.pm ul),
	.doc :global(.pm ol) {
		margin: 6px 0;
		padding-left: 22px;
	}
	.doc :global(.pm li p) {
		margin: 0;
	}
	.doc :global(.pm hr) {
		border: 0;
		border-top: 1.5px solid var(--rule);
		margin: 14px 0;
	}
	.doc :global(.pm p.is-empty:first-child::before),
	.doc :global(.pm > p:only-child:empty::before) {
		content: 'Type / to add a block';
		color: var(--quiet);
		pointer-events: none;
		float: left;
		height: 0;
	}
	.doc :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 8px 0;
		font-size: 14px;
	}
	.doc :global(td),
	.doc :global(th) {
		border: 1px solid var(--rule);
		padding: 6px 10px;
		min-width: 60px;
		vertical-align: top;
		text-align: left;
	}
	.doc :global(th) {
		background: var(--ground);
	}
	.doc :global(ul[data-type='taskList']) {
		list-style: none;
		padding-left: 0;
	}
	.doc :global(ul[data-type='taskList'] li) {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 4px 0;
	}
	.doc :global(ul[data-type='taskList'] li > label) {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: max(1.6em, 24px);
	}
	.doc :global(ul[data-type='taskList'] input) {
		width: 16px;
		height: 16px;
		margin: 0;
	}
	.doc :global(ul[data-type='taskList'] li > div) {
		flex: 1;
		min-width: 0;
	}
	.doc :global(ul[data-type='taskList'] li[data-checked='true'] > div) {
		text-decoration: line-through;
		color: var(--quiet);
	}
	.doc :global(img) {
		max-width: 100%;
		border-radius: 8px;
	}
	/* external links: underline = not colour alone; padding lifts the hit area to 24 px (#284) */
	.doc :global(.pm a:not(.pl)) {
		text-decoration: underline;
		padding: 3px 0;
	}
	.doc :global(a.pl) {
		padding: 0 4px;
		border-radius: 4px;
		background: var(--pill);
		color: var(--pill-ink);
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
		color: var(--pill-ink);
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
		/* vh shrinks with the on-screen keyboard: the rows scroll instead of hiding below it (#282) */
		max-height: calc(100vh - 20vh - 8px);
		overflow-y: auto;
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
		color: var(--pill-ink);
	}
</style>
