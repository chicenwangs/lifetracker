<script>
	import { onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { TableKit } from '@tiptap/extension-table';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import { Slash } from './slash.svelte.js';
	import { blockOps } from './blocks.js';

	let { tick, onchange } = $props();
	let el;

	onMount(() => {
		// the editor is NOT reactive state: Svelte never proxies or re-creates it
		const editor = new Editor({
			element: el,
			extensions: [StarterKit, TableKit, TaskList, TaskItem.configure({ nested: true }), Slash],
			content: '<p></p>',
			onUpdate: ({ editor }) => onchange?.(editor.getJSON()),
		});
		window.__editor = editor;
		window.__blocks = blockOps;
		window.__protos = [Editor.prototype, editor.view.constructor.prototype];
		return () => {
			editor.destroy();
			window.__editor = null;
		};
	});
</script>

<!-- a prop that changes on every tick, rendered beside the editor's own DOM -->
<small id="tick">{tick}</small>
<div class="doc" bind:this={el}></div>
