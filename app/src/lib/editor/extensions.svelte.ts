// Tiptap pieces for Pages (ADR-002): internal page link node, "/" menu, block operations.
import { Extension, Node } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Suggestion } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import SlashMenu from './SlashMenu.svelte';
import DatabaseView from '$lib/database/DatabaseView.svelte';

/** internal link by page id (PG-10): shows the page's CURRENT title, or "unavailable". Titles come from storage. */
export const PageLink = Node.create<{ titles: Record<string, { title: string; archived: boolean } | null> }>({
	name: 'pageLink',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	addAttributes: () => ({ pageId: { default: null } }),
	addOptions: () => ({ titles: {} }),
	// titles must be there before the first render, so they come in as an option (configure) and live in storage
	addStorage() {
		return { titles: { ...this.options.titles } };
	},
	parseHTML: () => [
		{ tag: 'a[data-page-link]', getAttrs: (el) => ({ pageId: (el as HTMLElement).dataset.pageLink }) },
	],
	renderHTML: ({ node }) => [
		'a',
		{ 'data-page-link': node.attrs.pageId, href: `/pages/${node.attrs.pageId}` },
		'page',
	],
	addNodeView() {
		return ({ node }) => {
			const a = document.createElement('a');
			const t = (this.storage.titles as Record<string, { title: string; archived: boolean } | null>)[
				node.attrs.pageId
			];
			a.className = 'pl' + (t === null ? ' gone' : '') + (t?.archived ? ' arch' : '');
			a.dataset.pageLink = node.attrs.pageId;
			if (t) a.href = `/pages/${node.attrs.pageId}`;
			a.textContent = t === null ? 'Unavailable page' : `↗ ${t?.title || 'Untitled'}`;
			if (t?.archived) a.title = 'Archived page';
			a.contentEditable = 'false';
			return { dom: a };
		};
	},
});

/** database block (PG-DB): the doc holds only the id; rows live in their own tables (DESIGN §7) */
export const DatabaseBlock = Node.create({
	name: 'database',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: false,
	addAttributes: () => ({ databaseId: { default: null } }),
	parseHTML: () => [
		{ tag: 'div[data-database]', getAttrs: (el) => ({ databaseId: (el as HTMLElement).dataset.database }) },
	],
	renderHTML: ({ node }) => ['div', { 'data-database': node.attrs.databaseId }],
	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('div');
			dom.contentEditable = 'false';
			const comp = mount(DatabaseView, {
				target: dom,
				props: { databaseId: node.attrs.databaseId as string },
			});
			// the table is its own world: ProseMirror must not eat its keys, clicks or DOM changes
			return { dom, stopEvent: () => true, ignoreMutation: () => true, destroy: () => void unmount(comp) };
		};
	},
});

/** keep undo groups apart: a block op right after typing must undo on its own (ADR-002 finding) */
const send = (view: EditorView, tr: Transaction) => view.dispatch(closeHistory(tr));
function current(state: EditorState) {
	const rf = state.selection.$from;
	const index = rf.index(0);
	return { index, pos: rf.posAtIndex(index, 0), node: state.doc.child(index) };
}
const selectAt = (tr: Transaction, pos: number) => tr.setSelection(NodeSelection.create(tr.doc, pos));

/** block select / move / duplicate / delete on top-level nodes (spike S-1 blocks.js) */
export const blockOps = {
	duplicate(view: EditorView) {
		const { pos, node } = current(view.state);
		send(view, selectAt(view.state.tr.insert(pos + node.nodeSize, node), pos + node.nodeSize));
	},
	remove(view: EditorView) {
		const { pos, node } = current(view.state);
		const para = view.state.schema.nodes.paragraph;
		// last block: leave an empty paragraph, never an empty doc
		if (view.state.doc.childCount === 1 && para)
			return send(view, view.state.tr.replaceWith(pos, pos + node.nodeSize, para.create()));
		send(view, view.state.tr.delete(pos, pos + node.nodeSize));
	},
	/** -1 up, +1 down; no-op at the edges */
	move(view: EditorView, dir: -1 | 1) {
		const { index, pos, node } = current(view.state);
		const doc = view.state.doc;
		const to = index + dir;
		if (to < 0 || to >= doc.childCount) return;
		const tr = view.state.tr.delete(pos, pos + node.nodeSize);
		const at = dir < 0 ? pos - doc.child(to).nodeSize : pos + doc.child(to).nodeSize;
		send(view, selectAt(tr.insert(at, node), at));
	},
};

/** Alt+↑ / Alt+↓ move the current block (keyboard path for reorder) */
export const BlockKeys = Extension.create({
	name: 'blockKeys',
	addKeyboardShortcuts() {
		return {
			'Alt-ArrowUp': () => (blockOps.move(this.editor.view, -1), true),
			'Alt-ArrowDown': () => (blockOps.move(this.editor.view, 1), true),
		};
	},
});

export interface SlashItem {
	title: string;
	hint?: string;
	run: (editor: import('@tiptap/core').Editor, range: { from: number; to: number }) => void;
}

/** "/" menu (PG-SLASH). Esc / cancel leaves "/text" as plain text. Not inside code. */
export const Slash = Extension.create<{ items: (q: string) => SlashItem[] }>({
	name: 'slash',
	addOptions: () => ({ items: () => [] }),
	addProseMirrorPlugins() {
		const items = this.options.items;
		return [
			Suggestion<SlashItem>({
				editor: this.editor,
				char: '/',
				allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
				items: ({ query }) => items(query),
				command: ({ editor, range, props }) => props.run(editor, range),
				render: () => {
					const s = $state({ items: [] as SlashItem[], index: 0, x: 0, y: 0 });
					let host: HTMLElement | undefined;
					let comp: ReturnType<typeof mount> | undefined;
					let pick: ((i: SlashItem) => void) | undefined;
					const sync = (p: { items: SlashItem[]; command: (i: SlashItem) => void; clientRect?: (() => DOMRect | null) | null }) => {
						const r = p.clientRect?.();
						Object.assign(s, { items: p.items, index: 0, x: r?.left ?? 0, y: r?.bottom ?? 0 });
						pick = p.command;
					};
					return {
						onStart(p) {
							host = document.body.appendChild(document.createElement('div'));
							host.dataset.slash = '';
							sync(p);
							comp = mount(SlashMenu, { target: host, props: { s, onpick: (i: SlashItem) => pick?.(i) } });
						},
						onUpdate: sync,
						onKeyDown({ event }) {
							const n = Math.max(1, s.items.length);
							if (event.key === 'ArrowDown') s.index = (s.index + 1) % n;
							else if (event.key === 'ArrowUp') s.index = (s.index + n - 1) % n;
							else if (event.key === 'Enter' && s.items[s.index]) pick?.(s.items[s.index] as SlashItem);
							else return false;
							return true;
						},
						onExit() {
							if (comp) unmount(comp);
							host?.remove();
						},
					};
				},
			}),
		];
	},
}); // prettier-ignore
