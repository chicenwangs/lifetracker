// Tiptap pieces for Pages (ADR-002): internal page link node, "/" menu, block operations.
import { Extension, Node } from '@tiptap/core';
import { TaskItem } from '@tiptap/extension-list';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView, type ViewMutationRecord } from '@tiptap/pm/view';
import { Suggestion, exitSuggestion } from '@tiptap/suggestion';
import { mount, unmount, type Component } from 'svelte';
import SlashMenu from './SlashMenu.svelte';
import MentionMenu from './MentionMenu.svelte';
import DatabaseView from '$lib/database/DatabaseView.svelte';
import PageIcon from '$lib/components/PageIcon.svelte';

// each Suggestion needs its own plugin key: two defaults collide ("Adding different instances of a keyed plugin")
const SLASH_KEY = new PluginKey('slashMenu');
const MENTION_KEY = new PluginKey('mentionMenu');

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

/** PR 18: callout (emoji + 4 tones, holds paragraphs/lists). Old clients/export see a blockquote. */
export const Callout = Node.create({
	name: 'callout',
	group: 'block',
	content: 'block+',
	defining: true,
	addAttributes: () => ({
		tone: { default: 'grey' },
		emoji: { default: '💡' },
	}),
	parseHTML: () => [
		{
			tag: 'div[data-callout]',
			getAttrs: (el) => ({
				tone: (el as HTMLElement).dataset.tone || 'grey',
				emoji: (el as HTMLElement).dataset.emoji || '💡',
			}),
		},
	],
	renderHTML: ({ node }) => [
		'blockquote',
		{ 'data-callout': '', 'data-tone': node.attrs.tone, 'data-emoji': node.attrs.emoji },
		0,
	],
	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement('div');
			dom.className = 'co';
			const ico = document.createElement('span');
			ico.className = 'co-ico';
			ico.contentEditable = 'false';
			const body = document.createElement('div');
			body.className = 'co-body';
			const tones = document.createElement('span');
			tones.className = 'co-tones';
			tones.contentEditable = 'false';
			dom.append(ico, body, tones);
			let iconApi: { setIcon?: (v: string | null) => void } = {};
			let emoji = String(node.attrs.emoji ?? '💡');
			const now = () => {
				const pos = getPos();
				return pos === undefined ? null : { pos, node: editor.state.doc.nodeAt(pos) };
			};
			const setAttrs = (patch: Record<string, unknown>) => {
				const cur = now();
				if (!cur?.node) return;
				editor.view.dispatch(
					editor.state.tr.setNodeMarkup(cur.pos, undefined, { ...cur.node.attrs, ...patch }),
				);
			};
			// one PageIcon instance for the life of the node view: an editor update must not remount it and close
			// the picker (W1 accept_fail #441); a changed emoji goes through the exported setIcon instead.
			const comp = mount(PageIcon, {
				target: ico,
				props: {
					icon: emoji,
					compact: true,
					label: 'Callout icon',
					onpick: (v) => v && setAttrs({ emoji: v }),
				},
			});
			iconApi = comp as unknown as { setIcon?: (v: string | null) => void };
			const swatches: HTMLButtonElement[] = [];
			for (const t of ['grey', 'blue', 'yellow', 'red']) {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'co-tone';
				b.dataset.tone = t;
				b.setAttribute('aria-label', `Tone ${t}`);
				b.title = t;
				b.onclick = () => setAttrs({ tone: t });
				tones.append(b);
				swatches.push(b);
			}
			const paint = (n: typeof node) => {
				dom.dataset.tone = String(n.attrs.tone ?? 'grey');
				dom.dataset.emoji = String(n.attrs.emoji ?? '');
				for (const b of swatches) b.setAttribute('aria-pressed', String(b.dataset.tone === n.attrs.tone));
			};
			paint(node);
			return {
				dom,
				contentDOM: body,
				update(n: typeof node) {
					const e = String(n.attrs.emoji ?? '💡');
					if (e !== emoji) {
						emoji = e;
						iconApi.setIcon?.(e);
					}
					paint(n);
					return true;
				},
				stopEvent: (e: Event) => !!(e.target as HTMLElement).closest?.('.co-ico, .co-tone'),
				// the emoji picker/tone buttons mutate DOM outside contentDOM; without this ProseMirror rebuilds the
				// whole node view (W1 root cause #441)
				ignoreMutation: (m: ViewMutationRecord) => !body.contains(m.target),
				destroy() {
					unmount(comp);
				},
			};
		};
	},
}); // prettier-ignore

/** PR 18: toggle. `open` is saved in the JSON; the first child is the summary, the rest is hidden when closed. */
export const Toggle = Node.create({
	name: 'toggle',
	group: 'block',
	content: 'block+',
	defining: true,
	addAttributes: () => ({
		open: {
			default: true,
			parseHTML: (el: HTMLElement) => el.dataset.open !== 'false',
			renderHTML: (a: Record<string, unknown>) => ({ 'data-open': String(!!a.open) }),
		},
	}),
	parseHTML: () => [{ tag: 'div[data-toggle]' }],
	renderHTML: ({ node }) => [
		'details',
		{ 'data-toggle': '', ...(node.attrs.open ? { open: '' } : {}) },
		['summary', {}, 'Toggle'],
		['div', {}, 0],
	],
	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement('div');
			dom.className = 'tg';
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'tg-btn';
			btn.contentEditable = 'false';
			btn.setAttribute('aria-label', 'Toggle body');
			const body = document.createElement('div');
			body.className = 'tg-body';
			dom.append(btn, body);
			const now = () => {
				const pos = getPos();
				return pos === undefined ? null : { pos, node: editor.state.doc.nodeAt(pos) };
			};
			const toggle = () => {
				const cur = now();
				if (!cur?.node) return;
				editor.view.dispatch(
					editor.state.tr.setNodeMarkup(cur.pos, undefined, {
						...cur.node.attrs,
						open: !cur.node.attrs.open,
					}),
				);
			};
			btn.onclick = toggle;
			// Enter on the summary opens a closed toggle (once open, Enter edits normally)
			body.addEventListener(
				'keydown',
				(e) => {
					if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
					const cur = now();
					const first = cur?.node?.firstChild;
					if (!cur?.node || !first || cur.node.attrs.open) return;
					const from = editor.state.selection.$from.pos;
					if (from > cur.pos && from <= cur.pos + first.nodeSize) {
						e.preventDefault();
						e.stopPropagation();
						toggle();
					}
				},
				true,
			);
			const paint = (n: typeof node) => {
				dom.dataset.open = String(!!n.attrs.open);
				btn.setAttribute('aria-expanded', String(!!n.attrs.open));
				dom.dataset.empty = String(n.childCount <= 1);
			};
			paint(node);
			return {
				dom,
				contentDOM: body,
				update(n: typeof node) {
					paint(n);
					return true;
				},
				stopEvent: (e: Event) => !!(e.target as HTMLElement).closest?.('.tg-btn'),
				ignoreMutation: (m: ViewMutationRecord) => !body.contains(m.target),
			};
		};
	},
}); // prettier-ignore

/** PR 18: table of contents (read-only list of H1-H3, live, click scrolls). */
export const Toc = Node.create({
	name: 'toc',
	group: 'block',
	atom: true,
	selectable: true,
	parseHTML: () => [{ tag: 'nav[data-toc]' }],
	renderHTML: () => ['nav', { 'data-toc': '' }, ['p', {}, 'On this page']],
	addNodeView() {
		return ({ editor }) => {
			const dom = document.createElement('div');
			dom.className = 'toc';
			const title = document.createElement('p');
			title.className = 'toc-title';
			title.textContent = 'On this page';
			const list = document.createElement('div');
			list.className = 'toc-list';
			dom.append(title, list);
			const build = () => {
				const rows: { level: number; text: string; pos: number }[] = [];
				editor.state.doc.descendants((n, pos) => {
					if (n.type.name === 'heading' && Number(n.attrs.level) <= 3)
						rows.push({ level: Number(n.attrs.level), text: n.textContent, pos });
					return true;
				});
				list.textContent = '';
				if (!rows.length) {
					const empty = document.createElement('span');
					empty.className = 'toc-empty';
					empty.textContent = 'Add headings to fill this';
					list.append(empty);
					return;
				}
				for (const r of rows) {
					const b = document.createElement('button');
					b.type = 'button';
					b.className = 'toc-row';
					b.dataset.level = String(r.level);
					b.textContent = r.text || 'Untitled heading';
					b.onclick = () => {
						const el = editor.view.nodeDOM(r.pos);
						if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
					};
					list.append(b);
				}
			};
			build();
			const onTx = (p: { transaction: { docChanged: boolean } }) => {
				if (p.transaction.docChanged) build();
			};
			editor.on('transaction', onTx);
			return {
				dom,
				stopEvent: (e: Event) => !!(e.target as HTMLElement).closest?.('.toc'),
				ignoreMutation: () => true, // atom block: the list is rebuilt by us on every doc change
				destroy() {
					editor.off('transaction', onTx);
				},
			};
		};
	},
}); // prettier-ignore
/** v4.0 PR 30: a stable id for a to-do, so a reminder survives page saves (page_blocks rows are rebuilt) */
export function newBlockId(): string {
	const a = new Uint8Array(16);
	crypto.getRandomValues(a);
	return 'pbl_' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

/** TaskItem that keeps our stable to-do id in the saved JSON */
export const TodoItem = TaskItem.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			blockId: {
				default: null,
				parseHTML: (el) => el.getAttribute('data-block-id'),
				renderHTML: (attrs) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {}),
			},
		};
	},
});

/** gives every to-do a blockId; a duplicated to-do gets a fresh one (a reminder follows one item only) */
export const TodoIds = Extension.create({
	name: 'todoIds',
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('todoIds'),
				appendTransaction: (trs, _old, state) => {
					if (!trs.some((t) => t.docChanged)) return null;
					const seen: string[] = [];
					const edits: { pos: number; attrs: Record<string, unknown> }[] = [];
					state.doc.descendants((node, pos) => {
						if (node.type.name !== 'taskItem') return;
						const id = node.attrs.blockId as string | null;
						if (id && !seen.includes(id)) {
							seen.push(id);
							return;
						}
						const next = newBlockId();
						seen.push(next);
						edits.push({ pos, attrs: { ...node.attrs, blockId: next } });
					});
					if (!edits.length) return null;
					const tr = state.tr;
					for (const e of edits) tr.setNodeMarkup(e.pos, undefined, e.attrs);
					return tr;
				},
			}),
		];
	},
});

export interface TodoReminderStore {
	labels: Record<string, string>;
	onOpen: (blockId: string) => void;
}
function todoChip(label: string, open: () => void, done: boolean): HTMLElement {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'todo-rem';
	b.textContent = `\u{1F514} ${label}`;
	b.disabled = done;
	b.title = done ? 'To-do done: reminder cancelled' : 'Edit reminder';
	b.contentEditable = 'false';
	b.addEventListener('mousedown', (e) => e.preventDefault());
	if (!done)
		b.addEventListener('click', (e) => {
			e.preventDefault();
			open();
		});
	return b;
}
/** the bell chip after a to-do: a decoration, so the saved doc never carries reminder state */
export const TodoReminders = Extension.create({
	name: 'todoReminders',
	addStorage() {
		return { labels: {}, onOpen: () => {} } as TodoReminderStore;
	},
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('todoReminders'),
				props: {
					decorations: (state) => {
						const store = this.storage as unknown as TodoReminderStore;
						const decos: Decoration[] = [];
						state.doc.descendants((node, pos) => {
							if (node.type.name !== 'taskItem') return;
							const id = node.attrs.blockId as string | null;
							const label = id ? store.labels[id] : '';
							if (!id || !label) return;
							const first = node.firstChild;
							const at = first ? pos + first.nodeSize : pos + node.nodeSize - 1;
							decos.push(
								Decoration.widget(
									at,
									() => todoChip(label, () => store.onOpen(id), node.attrs.checked === true),
									{ side: 1 },
								),
							);
						});
						return DecorationSet.create(state.doc, decos);
					},
				},
			}),
		];
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

/** one suggestion popup's state; both menus render it (SlashMenu, MentionMenu) */
export interface MenuState<T> {
	items: T[];
	index: number;
	x: number;
	y: number;
	top: number;
	q: string;
}

/** shared Suggestion render: ArrowUp/Down cycle, Enter picks, Esc exits (the plugin's own exit) */
function menuRender<T>(
	Comp: Component<{ s: MenuState<T>; onpick: (i: T) => void; onclose?: () => void }>,
	close?: () => void,
) {
	return () => {
		const s = $state<MenuState<T>>({ items: [], index: 0, x: 0, y: 0, top: 0, q: '' });
		let host: HTMLElement | undefined;
		let comp: ReturnType<typeof mount> | undefined;
		let pick: ((i: T) => void) | undefined;
		const sync = (p: {
			items: T[];
			query?: string;
			command: (i: T) => void;
			clientRect?: (() => DOMRect | null) | null;
		}) => {
			const r = p.clientRect?.();
			Object.assign(s, {
				items: p.items,
				index: 0,
				x: r?.left ?? 0,
				y: r?.bottom ?? 0,
				top: r?.top ?? 0,
				q: p.query ?? '',
			});
			pick = p.command;
		};
		return {
			onStart(p: Parameters<typeof sync>[0]) {
				host = document.body.appendChild(document.createElement('div'));
				host.dataset.slash = '';
				sync(p);
				comp = mount(Comp, { target: host, props: { s, onpick: (i: T) => pick?.(i), onclose: close } });
			},
			onUpdate: sync,
			onKeyDown({ event }: { event: KeyboardEvent }) {
				const n = Math.max(1, s.items.length);
				if (event.key === 'ArrowDown') s.index = (s.index + 1) % n;
				else if (event.key === 'ArrowUp') s.index = (s.index + n - 1) % n;
				else if (event.key === 'Enter') {
					// consumed even while the async list is still empty: Enter must not insert a newline under a picker
					if (s.items[s.index]) pick?.(s.items[s.index] as T);
				} else return false;
				return true;
			},
			onExit() {
				if (comp) unmount(comp);
				host?.remove();
			},
		};
	};
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
				pluginKey: SLASH_KEY,
				char: '/',
				allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
				items: ({ query }) => items(query),
				command: ({ editor, range, props }) => props.run(editor, range),
				render: menuRender(SlashMenu),
			}),
		];
	},
}); // prettier-ignore

export interface MentionItem {
	/** linked page (absent on the create row) */
	id?: string;
	title: string;
	icon: string | null;
	/** parent page title, shown faint */
	path?: string | null;
	archived?: boolean;
	/** create-a-page row: the typed query */
	create?: string;
}

/** "[[" link picker (PR 19). Same Suggestion render + keys as the "/" menu. */
export const Mention = Extension.create<{
	items: (q: string) => Promise<MentionItem[]>;
	pick: (i: MentionItem, range: { from: number; to: number }) => void;
}>({
	name: 'mention',
	addOptions: () => ({ items: async () => [], pick: () => {} }),
	addProseMirrorPlugins() {
		return [
			Suggestion<MentionItem>({
				editor: this.editor,
				pluginKey: MENTION_KEY,
				char: '[[',
				allowSpaces: true, // page titles have spaces: "[[Plan for friday" must keep matching
				allowedPrefixes: null, // "see [[Plan" mid-sentence must open too
				allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
				items: ({ query }) => this.options.items(query),
				command: ({ range, props }) => this.options.pick(props, range),
				render: menuRender(MentionMenu, () => exitSuggestion(this.editor.view, MENTION_KEY)),
			}),
		];
	},
}); // prettier-ignore
