// "/" menu as a Tiptap extension; the popup is a Svelte 5 component driven by one $state object.
import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import SlashMenu from './SlashMenu.svelte';

const ITEMS = [
	{ title: 'Heading 1', run: (c) => c.setNode('heading', { level: 1 }) },
	{ title: 'Bullet list', run: (c) => c.toggleBulletList() },
	{ title: 'To-do list', run: (c) => c.toggleTaskList() },
	{ title: 'Code block', run: (c) => c.setCodeBlock() },
	{ title: 'Table', run: (c) => c.insertTable({ rows: 2, cols: 2 }) },
];

export const Slash = Extension.create({
	name: 'slash',
	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				char: '/',
				items: ({ query }) => ITEMS.filter((i) => i.title.toLowerCase().includes(query.toLowerCase())),
				command: ({ editor, range, props }) => props.run(editor.chain().focus().deleteRange(range)).run(),
				render: () => {
					const s = $state({ items: [], index: 0, x: 0, y: 0 });
					let host, comp, pick;
					const sync = (p) => {
						const r = p.clientRect?.();
						Object.assign(s, { items: p.items, index: 0, x: r?.left ?? 0, y: r?.bottom ?? 0 });
						pick = p.command;
					};
					return {
						onStart(p) {
							host = document.body.appendChild(document.createElement('div'));
							host.dataset.slash = '';
							sync(p);
							comp = mount(SlashMenu, { target: host, props: { s } });
						},
						onUpdate: sync,
						onKeyDown({ event }) {
							const n = Math.max(1, s.items.length);
							if (event.key === 'ArrowDown') s.index = (s.index + 1) % n;
							else if (event.key === 'ArrowUp') s.index = (s.index + n - 1) % n;
							else if (event.key === 'Enter' && s.items[s.index]) pick(s.items[s.index]);
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
});
