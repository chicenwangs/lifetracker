<!-- Week page, top of the side column: which week of the month you are on + a heatmap of planned time.
     Cell shade = hours blocked on the planner that day. Red dot = all-day items with no time blocked yet.
     Click a week row to jump to it. -->
<script lang="ts">
	import { page } from '$app/state';
	import type { HeatDay } from '$lib/types';

	let {
		year,
		month,
		heat,
		from,
		today,
		ongo,
	}: {
		year: number;
		month: number;
		heat: HeatDay[];
		from: string;
		today: string;
		ongo: (monday: string) => void;
	} = $props();

	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];
	const DOW =
		page.data.user?.region === 'us'
			? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
			: ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

	const rows = $derived.by(() => {
		const out: HeatDay[][] = [];
		for (let i = 0; i < heat.length; i += 7) {
			const r = heat.slice(i, i + 7);
			if (r.some((d) => d.inMonth)) out.push(r);
		}
		return out;
	});
	const current = $derived(rows.findIndex((r) => r[0]?.date === from));

	/** 0 none · 1 < 2 h · 2 < 4 h · 3 < 6 h · 4 = 6 h+ */
	const level = (m: number) => (m <= 0 ? 0 : m < 120 ? 1 : m < 240 ? 2 : m < 360 ? 3 : 4);
	const hrs = (m: number) => (m ? `${Math.round((m / 60) * 10) / 10} h blocked` : 'nothing blocked');
	const weekSum = (r: HeatDay[]) => r.reduce((s, d) => s + d.blockedMin, 0);
	const weekOpen = (r: HeatDay[]) => r.reduce((s, d) => s + d.unblocked, 0);
</script>

<section class="card wm" aria-label="Month overview">
	<div class="top strip">
		<h2>{MONTHS[month - 1]} {year}</h2>
		<span class="wk">{current >= 0 ? `Week ${current + 1} of ${rows.length}` : `${rows.length} weeks`}</span>
	</div>
	<div class="grid">
		<div class="hd" aria-hidden="true">
			<span></span>
			{#each DOW as d, i (i)}<span>{d}</span>{/each}
		</div>
		{#each rows as r, ri (r[0]?.date)}
			<button
				type="button"
				class="row"
				class:on={ri === current}
				aria-current={ri === current ? 'true' : undefined}
				aria-label="Week {ri + 1}: {hrs(weekSum(r))}{weekOpen(r)
					? `, ${weekOpen(r)} all-day not blocked`
					: ''}{ri === current ? ' (shown)' : ''}"
				onclick={() => r[0] && ongo(r[0].date)}
			>
				<span class="wn">W{ri + 1}</span>
				{#each r as d (d.date)}
					<span
						class="c l{level(d.blockedMin)}"
						class:out={!d.inMonth}
						class:today={d.date === today}
						title="{d.date} · {hrs(d.blockedMin)}{d.unblocked ? ` · ${d.unblocked} not blocked` : ''}"
					>
						{Number(d.date.slice(8))}
						{#if d.unblocked}<i class="dot" aria-hidden="true"></i>{/if}
					</span>
				{/each}
			</button>
		{/each}
	</div>
	<div class="legend" aria-hidden="true">
		<span>Blocked</span>
		<span class="c l0 sw"></span><span class="c l1 sw"></span><span class="c l2 sw"></span><span
			class="c l3 sw"
		></span><span class="c l4 sw"></span>
		<span>6 h+</span>
		<span class="sp"></span>
		<i class="dot inl"></i><span>not blocked</span>
	</div>
</section>

<style>
	.wm {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin: -14px -16px 0;
		padding: 12px 16px;
		background: var(--strip-c);
	}
	h2 {
		font-size: 15px;
		font-weight: 700;
	}
	.wk {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink);
		border-radius: 10px;
		padding: 1px 8px;
		background: var(--card);
		border: 1.5px solid var(--card-edge);
	}
	.grid {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.hd,
	.row {
		display: grid;
		grid-template-columns: 26px repeat(7, 1fr);
		gap: 3px;
		align-items: center;
	}
	.hd span {
		font-size: 10px;
		color: var(--quiet);
		text-align: center;
	}
	.row {
		border: 0;
		background: none;
		padding: 2px;
		border-radius: 8px;
		cursor: pointer;
		color: var(--ink);
		font: inherit;
		outline: 2px solid transparent;
	}
	.row:hover {
		background: var(--hover);
	}
	.row.on {
		background: var(--hover);
		outline: 2px solid var(--today);
	}
	.row:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.wn {
		font-size: 10px;
		font-weight: 600;
		color: var(--quiet);
	}
	.row.on .wn {
		color: var(--ink);
	}
	.c {
		position: relative;
		height: 26px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 500;
		border: 1px solid var(--rule);
	}
	.l0 {
		background: var(--card);
	}
	.l1 {
		background: color-mix(in srgb, var(--heat) 18%, var(--card));
	}
	.l2 {
		background: color-mix(in srgb, var(--heat) 36%, var(--card));
	}
	.l3 {
		background: color-mix(in srgb, var(--heat) 58%, var(--card));
		color: var(--card);
	}
	.l4 {
		background: var(--heat);
		color: var(--card);
		border-color: transparent;
	}
	.c.out {
		border-style: dashed;
		font-weight: 400;
	}
	.c.out.l0 {
		color: var(--quiet);
	}
	.c.today {
		box-shadow: 0 0 0 2px var(--now);
	}
	.dot {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 6px;
		height: 6px;
		border-radius: 3px;
		box-shadow: 0 0 0 1.5px var(--card);
		background: var(--exam-bg);
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--quiet);
	}
	.legend .sw {
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}
	.legend .sp {
		flex: 1;
	}
	.dot.inl {
		position: static;
		box-shadow: none;
	}

	.row {
		transition:
			background-color var(--t) var(--ease),
			outline-color var(--t) var(--ease);
	}
	.c {
		transition: transform var(--t-fast) var(--ease);
	}
	.row:hover .c {
		transform: translateY(-1px);
	}
</style>
