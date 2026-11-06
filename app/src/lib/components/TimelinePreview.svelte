<!-- Read-only day timeline beside the N palette. Shows that day's blocks + the dashed draft, moving as you type.
     A range that crosses midnight is shown on its first day only (clipped at 24:00). -->
<script lang="ts">
	import DraftBlock from './DraftBlock.svelte';
	import { blockType, colorsFor } from '$lib/colors';
	import { layoutDay } from '$lib/planner-layout';
	import { hhmm, nowLocalMinutes, prettyDate, todayLocal, weekdayOf } from '$lib/time';
	import type { BlockDTO, ItemType } from '$lib/types';

	let {
		date,
		tz,
		blocks,
		loading = false,
		draft,
	}: {
		date: string;
		tz: string;
		blocks: BlockDTO[];
		loading?: boolean;
		draft: {
			start: number;
			end: number;
			title: string;
			type: ItemType | null;
			thin: boolean;
			clippedEnd: boolean;
			note: string;
		};
	} = $props();

	const HOUR = 48;
	const PX_MIN = HOUR / 60;
	const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	let scroller: HTMLDivElement | undefined = $state();
	let first = true;
	const pieces = $derived(layoutDay(blocks, date, tz));
	const clash = $derived(
		draft.thin ? 0 : pieces.filter((p) => p.top < draft.end && p.bottom > draft.start).length,
	);
	const isToday = $derived(date === todayLocal(tz));
	const nowMin = $derived(isToday ? nowLocalMinutes(tz) : -1);

	// keep the draft in view (about a third from the top), smooth after the first jump
	$effect(() => {
		const top = draft.start * PX_MIN;
		void date;
		if (!scroller) return;
		const target = Math.max(0, top - scroller.clientHeight / 3);
		scroller.scrollTo({ top: target, behavior: first ? 'auto' : 'smooth' });
		first = false;
	});
</script>

<div class="tlp" aria-label="Timeline preview for {prettyDate(date)}">
	<div class="head">
		<div>
			<span class="muted">{DAYS[weekdayOf(date) - 1]}{isToday ? ' · today' : ''}</span>
			<b>{prettyDate(date).split(' ').slice(1, 3).join(' ')}</b>
		</div>
		<span class="st" class:warn={clash > 0}>
			{#if loading}loading…{:else if clash}overlaps {clash} block{clash > 1 ? 's' : ''}{:else}free{/if}
		</span>
	</div>
	<div class="scroll" bind:this={scroller}>
		<div class="grid" style:height="{24 * HOUR}px">
			{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
				<div class="hr" style:top="{h * HOUR}px" style:height="{HOUR}px">
					<span>{String(h).padStart(2, '0')}:00</span>
				</div>
			{/each}
			{#if nowMin >= 0}
				<div class="now" style:top="{nowMin * PX_MIN}px" aria-hidden="true"><span></span><i></i></div>
			{/if}
			{#each pieces as p (p.b.id)}
				{@const c = colorsFor(blockType(p.b))}
				<div
					class="blk"
					class:done={p.b.status === 'done'}
					style:top="{p.top * PX_MIN}px"
					style:height="{Math.max(16, (p.bottom - p.top) * PX_MIN)}px"
					style:left="calc(56px + (100% - 70px) * {p.col / p.cols})"
					style:width="calc((100% - 70px) / {p.cols} - 4px)"
					style:background={c.bg}
					style:color={c.ink}
					style:--line={c.line}
				>
					<span class="lbl">{p.b.label}</span>
					{#if (p.bottom - p.top) * PX_MIN >= 30}<span class="tm">{hhmm(p.top)} – {hhmm(p.bottom)}</span>{/if}
				</div>
			{/each}
			<DraftBlock
				start={draft.start}
				end={draft.end}
				pxMin={PX_MIN}
				title={draft.title || 'New entry'}
				type={draft.type}
				thin={draft.thin}
				clippedEnd={draft.clippedEnd}
				note={draft.note}
				animate
			/>
		</div>
	</div>
</div>

<style>
	.tlp {
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 16px 48px var(--shadow);
		color: var(--ink);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid var(--rule);
		font-size: 12px;
	}
	.head > div {
		display: flex;
		flex-direction: column;
	}
	.head b {
		font-size: 16px;
	}
	.st {
		font-size: 11px;
		color: var(--quiet);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1px 8px;
	}
	.st.warn {
		color: var(--exam-ink);
		background: var(--exam-bg);
		border-color: transparent;
	}
	.scroll {
		height: 420px;
		max-height: 60vh;
		overflow-y: auto;
		position: relative;
	}
	.grid {
		position: relative;
		user-select: none;
	}
	.hr {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px solid var(--rule);
	}
	.hr span {
		display: block;
		width: 56px;
		padding: 3px 0 0 12px;
		font-size: 11px;
		color: var(--quiet);
	}
	.now {
		position: absolute;
		left: 50px;
		right: 0;
		display: flex;
		align-items: center;
		z-index: 6;
		transform: translateY(-4px);
	}
	.now span {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background: var(--now);
	}
	.now i {
		flex: 1;
		height: 2px;
		background: var(--now);
	}
	.blk {
		position: absolute;
		border-radius: 7px;
		padding: 3px 8px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		z-index: 3;
		border: 1px solid var(--line, transparent);
		box-sizing: border-box;
	}
	.blk.done .lbl {
		text-decoration: line-through;
	}
	.lbl {
		font-size: 12px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tm {
		font-size: 11px;
	}
</style>
