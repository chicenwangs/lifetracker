<!-- The dashed "new block" box. Same look for planner drag, week drag preview and the N palette timeline.
     Grey (type None) until a /type is typed, then tinted with that Type colour. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { colorsFor } from '$lib/colors';
	import { hhmm } from '$lib/time';
	import type { ItemType } from '$lib/types';

	let {
		start,
		end,
		pxMin,
		offset = 0,
		title = '',
		type = null,
		clippedEnd = false,
		thin = false,
		animate = false,
		note = '',
		children,
	}: {
		start: number;
		end: number;
		pxMin: number;
		/** minutes hidden above the grid (rolled hours) */
		offset?: number;
		title?: string;
		/** null = no type yet: grey, same as the block it will create */
		type?: ItemType | null;
		clippedEnd?: boolean;
		/** calendar item: time only, no block */
		thin?: boolean;
		animate?: boolean;
		note?: string;
		children?: Snippet;
	} = $props();

	const c = $derived(colorsFor(type));
	const endLabel = $derived(end >= 1440 ? '24:00' : hhmm(end));
</script>

<div
	class="draft"
	class:anim={animate}
	class:ce={clippedEnd}
	class:thin
	class:compact={!children && (end - start) * pxMin < 46}
	style:top="{(start - offset) * pxMin}px"
	style:height="{Math.max(24, (end - start) * pxMin)}px"
	style:--d-bg={c ? `color-mix(in srgb, ${c.bg} 85%, transparent)` : undefined}
	style:--d-ink={c?.ink}
>
	<span class="tm"
		>{hhmm(start)}{thin ? '' : ` – ${clippedEnd ? '…' : endLabel}`}{#if note}<span class="nt">
				· {note}</span
			>{/if}</span
	>
	{#if title}<span class="ttl">{title}</span>{/if}
	{@render children?.()}
</div>

<style>
	.draft {
		position: absolute;
		left: 56px;
		right: 14px;
		border: 1.5px dashed var(--d-ink, var(--ink));
		border-radius: 8px;
		background: var(--d-bg, color-mix(in srgb, var(--card) 88%, transparent));
		color: var(--d-ink, var(--ink));
		padding: 4px 8px;
		z-index: 7;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 24px;
		overflow: visible;
		box-sizing: border-box;
		cursor: default;
	}
	.draft.anim {
		transition:
			top 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			height 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			background-color 0.15s,
			border-color 0.15s;
	}
	.draft.ce {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom-width: 2.5px;
	}
	.draft.compact {
		flex-direction: row;
		align-items: baseline;
		gap: 8px;
		padding-top: 3px;
	}
	.draft.thin {
		border-style: dotted;
	}
	.tm {
		font-size: 11px;
		white-space: nowrap;
		font-weight: 600;
	}
	.nt {
		font-weight: 400;
		opacity: 0.85;
	}
	.ttl {
		font-size: 13px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
