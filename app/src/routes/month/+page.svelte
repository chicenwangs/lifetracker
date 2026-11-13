<!-- Phone Month: 6 x 7 grid, a dot per thing that day (type colour, max 3 + count). Tap a day = its Today view. -->
<script lang="ts">
	import { shown } from '$lib/client/itemtypes.svelte';
	import { entryColors } from '$lib/client/partner';
	import { addDays, utcToLocal } from '$lib/time';
	import type { BlockDTO, ItemDTO } from '$lib/types';

	let { data } = $props();
	const tz = $derived(data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; // prettier-ignore
	const shift = (n: number) => {
		const d = new Date(Date.UTC(Number(data.ym.slice(0, 4)), Number(data.ym.slice(5, 7)) - 1 + n, 1));
		return d.toISOString().slice(0, 7);
	};
	const cells = $derived.by(() => {
		const out: { date: string; inMonth: boolean; things: (ItemDTO | BlockDTO)[] }[] = [];
		for (let d = data.from; d < data.to; d = addDays(d, 1))
			out.push({
				date: d,
				inMonth: d.startsWith(data.ym),
				things: [
					...shown(data.cal.items).filter((i) => i.date && i.date <= d && (i.endDate ?? i.date) >= d),
					...shown(data.cal.blocks).filter((b) => utcToLocal(b.startAt, tz).date === d),
				],
			});
		return out;
	});
	const heads = $derived(cells.slice(0, 7).map((c) => new Date(c.date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'narrow', timeZone: 'UTC' }))); // prettier-ignore
</script>

<svelte:head><title>Month · Life Tracker</title></svelte:head>

<main class="pm card">
	<div class="bar">
		<a class="btn sm" href="/month?m={shift(-1)}" aria-label="Previous month">‹</a>
		<h1>{MONTHS[Number(data.ym.slice(5, 7)) - 1]} {data.ym.slice(0, 4)}</h1>
		<a class="btn sm" href="/month?m={shift(1)}" aria-label="Next month">›</a>
	</div>
	<nav class="grid" aria-label="Days">
		{#each heads as h, i (i)}<span class="wd" aria-hidden="true">{h}</span>{/each}
		{#each cells as c (c.date)}
			<a
				class="cell"
				class:out={!c.inMonth}
				class:today={c.date === data.today}
				href="/today?d={c.date}"
				aria-label="{c.date}, {c.things.length} planned"
			>
				<span class="n">{Number(c.date.slice(8))}</span>
				<span class="dots">
					{#each c.things.slice(0, 3) as t (t.id)}<i style:background={entryColors(t).bg}></i>{/each}
					{#if c.things.length > 3}<b>+{c.things.length - 3}</b>{/if}
				</span>
			</a>
		{/each}
	</nav>
	<a class="hint" href="/?desktop=1">Full month (PC view)</a>
</main>

<style>
	.pm {
		margin: 8px 12px 104px;
		padding: 12px;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h1 {
		font-size: 18px;
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		margin: 10px 0;
	}
	.wd {
		text-align: center;
		font-size: 11px;
		color: var(--muted);
	}
	.cell {
		min-height: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding-top: 4px;
		border-radius: 8px;
		color: var(--ink);
		text-decoration: none;
	}
	.cell.out {
		color: var(--muted);
	}
	.cell.today .n {
		background: var(--accent);
		color: #00003d;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
	}
	.n {
		font-size: 13px;
	}
	.dots {
		display: flex;
		gap: 2px;
		align-items: center;
	}
	.dots i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.dots b {
		font-size: 9px;
		font-weight: 600;
	}
</style>
