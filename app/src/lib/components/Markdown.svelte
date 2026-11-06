<!-- Notes render: marked -> DOMPurify. Only place raw HTML is allowed. -->
<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	let { source }: { source: string } = $props();
	const html = $derived(
		DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: true }) as string, {
			USE_PROFILES: { html: true },
			FORBID_TAGS: ['style', 'form', 'input', 'img'],
		}),
	);
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised above -->
<div class="md">{@html html}</div>

<style>
	.md :global(p) {
		margin: 0 0 8px;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0 0 8px;
		padding-left: 20px;
	}
	.md :global(code) {
		background: var(--ground);
		padding: 1px 4px;
		border-radius: 4px;
		font-size: 12px;
	}
	.md :global(a) {
		text-decoration: underline;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3) {
		margin: 16px 0 8px;
		line-height: 1.25;
	}
	.md :global(h1) {
		font-size: 22px;
	}
	.md :global(h2) {
		font-size: 18px;
	}
	.md :global(h3) {
		font-size: 15px;
	}
	.md :global(:first-child) {
		margin-top: 0;
	}
	.md :global(blockquote) {
		margin: 0 0 8px;
		padding: 2px 12px;
		border-left: 3px solid var(--border);
		color: var(--quiet);
	}
	.md :global(pre) {
		background: var(--ground);
		padding: 10px 12px;
		border-radius: 8px;
		overflow-x: auto;
	}
	.md :global(pre code) {
		background: none;
		padding: 0;
	}
	.md :global(hr) {
		border: 0;
		border-top: 1px solid var(--rule);
		margin: 14px 0;
	}
	.md :global(table) {
		border-collapse: collapse;
		margin: 0 0 8px;
	}
	.md :global(th),
	.md :global(td) {
		border: 1px solid var(--rule);
		padding: 4px 8px;
	}
</style>
