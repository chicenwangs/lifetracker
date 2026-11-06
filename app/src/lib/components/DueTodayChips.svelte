<!-- FR-H12. Due chips (not done). HTML5-draggable onto planner -> 60-min linked block. -->
<script lang="ts">
	import { colorsFor } from '$lib/colors';
	import type { ItemDTO } from '$lib/types';
	let { items, label = 'Due today' }: { items: ItemDTO[]; label?: string } = $props();
</script>

<div class="due">
	<span class="cap">{label.toUpperCase()} · DRAG ONTO GRID</span>
	{#each items as i (i.id)}
		{@const c = colorsFor(i.type)}
		<a
			class="chip"
			href="/item/{i.id}"
			draggable="true"
			style:background={c.bg}
			style:color={c.ink}
			title="Drag onto the planner to block 60 min"
			ondragstart={(e) => {
				e.dataTransfer?.setData('application/x-lt-item', i.id);
				e.dataTransfer?.setData('text/plain', i.title);
				if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
			}}>{i.title}</a
		>
	{:else}
		<span class="muted none">Nothing due.</span>
	{/each}
</div>

<style>
	.due {
		padding: 10px 16px;
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: center;
		border-bottom: 1px solid var(--rule);
	}
	.cap {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--quiet);
		margin-right: 4px;
	}
	.chip {
		height: 26px;
		padding: 0 10px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		display: flex;
		align-items: center;
		cursor: grab;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip:hover {
		text-decoration: none;
		filter: brightness(0.97);
	}
	.none {
		font-size: 12px;
	}
</style>
