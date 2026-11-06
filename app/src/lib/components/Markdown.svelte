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
</style>
