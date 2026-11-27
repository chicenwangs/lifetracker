<!-- Phone Month (Calendar tab, #95): 6 x 7 grid, a dot per thing that day (type colour, max 3 + count). Tap a day =
     select it: its agenda shows below, you stay in Calendar. Swipe the grid for the month before / after. -->
<script lang="ts">
	import GestureHint from '$lib/components/GestureHint.svelte';
	import { shown, shownOnMonth } from '$lib/client/itemtypes.svelte';
	import { entryColors } from '$lib/client/partner';
	import { addDays, clipToDay, hhmm, prettyDate, weekStartOf } from '$lib/time';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { openItem } from '$lib/client/peek.svelte';
	import { peerSwipe } from '$lib/client/peerSwipe';
	import CalSwitch from '$lib/components/CalSwitch.svelte';
	import ActionSheet from '$lib/components/ActionSheet.svelte';
	import { invalidateAll } from '$lib/client/refresh';
	import { deleteRow, toggleDone } from '$lib/client/rowOps';
	import { rowGestures } from '$lib/client/rowGestures';
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
					...shownOnMonth(shown(data.cal.items)).filter(
						(i) => i.date && i.date <= d && (i.endDate ?? i.date) >= d,
					),
					...shown(data.cal.blocks).filter((b) => clipToDay(b.startAt, b.endAt, d, tz)),
				],
			});
		return out;
	});
	// selected day: ?d=, else today when it's in this month, else the 1st
	const sel = $derived.by(() => {
		const d = page.url.searchParams.get('d');
		if (d && cells.some((c) => c.date === d)) return d;
		return data.today.startsWith(data.ym) ? data.today : `${data.ym}-01`;
	});
	// a block that began the day before shows from 00:00 on the selected day
	const timeOf = (t: ItemDTO | BlockDTO) =>
		'startAt' in t ? hhmm(clipToDay(t.startAt, t.endAt, sel, tz)?.top ?? 0) : ((t as ItemDTO).time ?? '');
	const agenda = $derived(
		(cells.find((c) => c.date === sel)?.things ?? []).toSorted((a, b) => timeOf(a).localeCompare(timeOf(b))),
	);
	const labelOf = (t: ItemDTO | BlockDTO) => ('title' in t ? t.title : t.label);
	const itemIdOf = (t: ItemDTO | BlockDTO) => ('startAt' in t ? t.itemId : t.id);
	const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
	// row gestures + actions (#96): same meaning as Today and Week
	const mine = (t: ItemDTO | BlockDTO) => t.editable && !t.theirs;
	const refresh = () => invalidateAll();
	let acting = $state<ItemDTO | BlockDTO | null>(null);
	// closures over a plain value: ActionSheet closes (acting = null) before run() fires (#324)
	const actionsFor = (a: ItemDTO | BlockDTO) => [
		{ label: a.status === 'done' ? 'Not done' : 'Done', run: () => toggleDone(a, refresh) },
		...(itemIdOf(a) ? [{ label: 'Move…', run: () => openItem(itemIdOf(a) as string) }] : []),
		{ label: 'Delete', danger: true, run: () => deleteRow(a, refresh) },
	];
	const heads = $derived(cells.slice(0, 7).map((c) => new Date(c.date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'narrow', timeZone: 'UTC' }))); // prettier-ignore
</script>

<svelte:head><title>Month · Life Tracker</title></svelte:head>

<main class="pm">
	<CalSwitch
		on="month"
		week="/week?w={weekStartOf(sel, data.user?.region === 'us' ? 7 : 1)}"
		month="/month?m={data.ym}"
	/>
	<GestureHint
		id="month"
		text="Swipe the month sideways for the one before or after. Tap a day to see its plans below."
	/>
	<div class="card mc">
		<div class="bar">
			<a class="btn sm" href="/month?m={shift(-1)}" aria-label="Previous month">‹</a>
			<h1>{monthName(data.ym)}</h1>
			<a class="btn sm" href="/month?m={shift(1)}" aria-label="Next month">›</a>
		</div>
		<nav
			class="grid"
			aria-label="Days. Swipe sideways for the month before or after"
			use:peerSwipe={{
				step: (n) => goto(`/month?m=${shift(n)}`, { noScroll: true }),
				peek: (n) => monthName(shift(n)),
			}}
		>
			{#each heads as h, i (i)}<span class="wd" aria-hidden="true">{h}</span>{/each}
			{#each cells as c (c.date)}
				<a
					class="cell"
					class:out={!c.inMonth}
					class:today={c.date === data.today}
					class:sel={c.date === sel}
					href="/month?m={c.date.slice(0, 7)}&d={c.date}"
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={c.date === sel ? 'date' : undefined}
					aria-label="{prettyDate(c.date)}, {c.things.length} planned"
				>
					<span class="n">{Number(c.date.slice(8))}</span>
					<span class="dots">
						{#each c.things.slice(0, 3) as t (t.id)}<i style:background={entryColors(t).bg}></i>{/each}
						{#if c.things.length > 3}<b aria-hidden="true" data-n="+{c.things.length - 3}"></b>{/if}
					</span>
				</a>
			{/each}
		</nav>
	</div>
	<section class="card agenda" aria-label="Agenda for {prettyDate(sel)}">
		<h2>{prettyDate(sel)}</h2>
		{#each agenda as t (t.id)}
			{@const id = itemIdOf(t)}
			{@const c = entryColors(t)}
			{#snippet body()}
				<span class="tm">{timeOf(t) || 'All day'}</span><span class="tt">{labelOf(t)}</span>
			{/snippet}
			<div
				class="rw"
				use:rowGestures={mine(t)
					? { done: () => toggleDone(t, refresh), remove: () => deleteRow(t, refresh) }
					: {}}
			>
				{#if id}
					<button class="row" type="button" style:--bg={c.bg} style:--fg={c.ink} onclick={() => openItem(id)}
						>{@render body()}</button
					>
				{:else}
					<div class="row" style:--bg={c.bg} style:--fg={c.ink}>{@render body()}</div>
				{/if}
				{#if mine(t)}<button
						class="more"
						type="button"
						aria-label="Actions for {labelOf(t)}"
						onclick={() => (acting = t)}>⋯</button
					>{/if}
			</div>
		{:else}
			<p class="muted">Nothing planned.</p>
		{/each}
		<a class="btn sm" href="/today?d={sel}">Open in Today</a>
		{#if acting}
			<ActionSheet title={labelOf(acting)} actions={actionsFor(acting)} onclose={() => (acting = null)} />
		{/if}
	</section>
</main>

<style>
	.pm {
		margin: 8px 12px 104px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.mc {
		padding: 12px;
		overflow-x: clip;
	}
	.cell.sel {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
	}
	.agenda {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.agenda h2 {
		font-size: 15px;
		margin: 0 0 4px;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 48px;
		padding: 0 12px;
		border: 0;
		border-radius: 10px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	div.row {
		cursor: default;
	}
	.rw {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.rw > .row {
		flex: 1;
		min-width: 0;
	}
	.more {
		flex: none;
		width: 48px;
		height: 48px;
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 20px;
		cursor: pointer;
	}
	.tm {
		font-size: 13px;
		min-width: 52px;
	}
	.tt {
		font-weight: 600;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.agenda .btn {
		align-self: flex-start;
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
		font-size: max(var(--fs-min), 11px);
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
		border-radius: 999px;
		min-width: 24px; /* grows with the text size (200 % font) instead of overlapping the dots */
		min-height: 24px;
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
		font-size: max(var(--fs-min), 9px);
		font-weight: 600;
	}
	/* the count is drawn, not text: the link name (aria-label) already says it (#298) */
	.dots b::after {
		content: attr(data-n);
	}
</style>
