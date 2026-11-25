<!-- Phone Week (FEATURES §10): agenda, one section per day. Tap a day = that day's Today; tap an item = its page.
     #96: swipe a row right = done, left = delete; hold + drag it onto another day = move; ⋯ = the same by tap. -->
<script lang="ts">
	import { shown } from '$lib/client/itemtypes.svelte';
	import { entryColors } from '$lib/client/partner';
	import { addDays, clipToDay, hhmm, prettyDate } from '$lib/time';
	import type { BlockDTO, CalendarPayload, ItemDTO } from '$lib/types';
	import ActionSheet from './ActionSheet.svelte';
	import { askText } from '$lib/client/dialog.svelte';
	import { openItem } from '$lib/client/peek.svelte';
	import { invalidateAll } from '$lib/client/refresh';
	import { deleteRow, moveRow, toggleDone } from '$lib/client/rowOps';
	import { postpones } from '$lib/client/reschedule';
	import { rowGestures } from '$lib/client/rowGestures';

	let {
		from,
		to,
		today,
		tz,
		cal,
	}: { from: string; to: string; today: string; tz: string; cal: CalendarPayload } = $props();

	type Row = { key: string; time: string; label: string; href: string | null; x: ItemDTO | BlockDTO };
	const days = $derived.by(() => {
		const out: { date: string; rows: Row[] }[] = [];
		for (let d = from; d < to; d = addDays(d, 1)) {
			const rows: Row[] = [];
			for (const i of shown(cal.items))
				if (i.date && i.date <= d && (i.endDate ?? i.date) >= d)
					rows.push({ key: i.id, time: i.date === d ? (i.time ?? '') : '', label: i.title, href: i.editable && !i.theirs ? `/item/${i.id}` : null, x: i }); // prettier-ignore
			for (const b of shown(cal.blocks)) {
				const c = clipToDay(b.startAt, b.endAt, d, tz); // a block over midnight shows on both days
				if (c)
					rows.push({ key: b.id, time: hhmm(c.top), label: b.label, href: b.itemId && !b.theirs ? `/item/${b.itemId}` : null, x: b }); // prettier-ignore
			}
			rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
			out.push({ date: d, rows });
		}
		return out;
	});
	const mine = (r: Row) => r.x.editable && !r.x.theirs && !r.x.busy;
	const refresh = () => invalidateAll();
	const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
	let over = $state<string | null>(null); // the day a carried row would land on
	let acting = $state<{ r: Row; date: string } | null>(null);
	// under the finger, looking through the lifted row itself
	const dayAt = (x: number, y: number) =>
		(
			document
				.elementsFromPoint(x, y)
				.find((e) => !e.closest('.lt-lifted') && e.closest('section[data-date]'))
				?.closest('section[data-date]') as HTMLElement | undefined
		)?.dataset.date ?? null;
	function gestures(r: Row, date: string) {
		if (!mine(r)) return {};
		return {
			done: () => toggleDone(r.x, refresh),
			remove: () => deleteRow(r.x, refresh),
			drag: (_dy: number, x: number, y: number) => (over = dayAt(x, y)),
			drop: (_dy: number, x: number, y: number) => {
				const to = dayAt(x, y);
				over = null;
				if (to && to !== date) return moveRow(r.x, { days: daysBetween(date, to) }, refresh);
			},
		};
	}
	async function pickDay(r: Row, date: string) {
		const id = 'startAt' in r.x ? r.x.itemId : r.x.id;
		if (id) return openItem(id); // the item sheet edits the day
		const d = await askText('Move to which day? (YYYY-MM-DD)', { value: date, ok: 'Move' });
		if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return moveRow(r.x, { days: daysBetween(date, d) }, refresh);
	}
	// closures over a plain value: ActionSheet closes (acting = null) before run() fires (#324)
	const actionsFor = (a: { r: Row; date: string }) => [
		// v3.2: postpone a whole item (a block is history, it stays)
		...('startAt' in a.r.x ? [] : postpones(a.r.x, { today, tz, refresh })),
		{ label: a.r.x.status === 'done' ? 'Not done' : 'Done', run: () => toggleDone(a.r.x, refresh) },
		{ label: 'Move…', run: () => pickDay(a.r, a.date) },
		{ label: 'Delete', danger: true, run: () => deleteRow(a.r.x, refresh) },
	];
</script>

<div class="pweek">
	{#each days as d (d.date)}
		<section class="day card" class:today={d.date === today} class:over={over === d.date} data-date={d.date}>
			<a class="hd" href="/today?d={d.date}">{prettyDate(d.date).replace(/ \d{4}$/, '')}</a>
			{#each d.rows as r (r.key)}
				{@const c = entryColors(r.x)}
				<div class="rw" use:rowGestures={gestures(r, d.date)}>
					<!-- #222: a div, not <a href>: Android WebView's link preview on a long press would take the hold -->
					{#snippet inner()}
						<span class="tm">{r.time || 'all day'}</span>
						<span class="lb">{r.x.busy ? 'Busy' : r.label}</span>
						{#if r.x.theirs}<span class="who" style:background={r.x.owner?.color}>{r.x.owner?.initial}</span
							>{/if}
					{/snippet}
					{#if r.href}
						{@const href = r.href}
						<div
							role="link"
							tabindex="0"
							onclick={() => openItem(href.slice('/item/'.length))}
							onkeydown={(e) => e.key === 'Enter' && openItem(href.slice('/item/'.length))}
							class="row"
							class:theirs={r.x.theirs}
							style:--bg={c.bg}
							style:--fg={c.ink}
						>
							{@render inner()}
						</div>
					{:else}
						<div class="row" class:theirs={r.x.theirs} style:--bg={c.bg} style:--fg={c.ink}>
							{@render inner()}
						</div>
					{/if}
					{#if mine(r)}<button
							class="more"
							type="button"
							aria-label="Actions for {r.label}"
							onclick={() => (acting = { r, date: d.date })}>⋯</button
						>{/if}
				</div>
			{:else}<span class="hint">Nothing planned</span>{/each}
		</section>
	{/each}
</div>
{#if acting}
	<ActionSheet title={acting.r.label} actions={actionsFor(acting)} onclose={() => (acting = null)} />
{/if}

<style>
	.rw {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.rw > :global(.row) {
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
	.day.over {
		outline: 2px dashed var(--ink);
	}
	.pweek {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.day {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.day.today {
		outline: 2px solid var(--accent);
	}
	.hd {
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		min-height: 48px;
		display: flex;
		align-items: center;
	}
	.row {
		user-select: none; /* hold lifts the row (#96, #222) */
		-webkit-touch-callout: none;
		cursor: pointer;
		display: flex;
		gap: 10px;
		align-items: center;
		min-height: 48px;
		padding: 0 10px;
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		text-decoration: none;
		font-size: 14px;
	}
	.row.theirs {
		background: repeating-linear-gradient(135deg, var(--bg) 0 6px, transparent 6px 10px);
		color: var(--ink);
	}
	.tm {
		width: 52px;
		flex: none;
		font-size: 12px;
	}
	.lb {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		white-space: normal; /* FullCalendar sets nowrap on events */
		line-clamp: 2;
		overflow-wrap: anywhere;
		line-height: 1.3;
		padding: 4px 0;
	}
	.who {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: #fff;
		font-size: max(var(--fs-min), 11px);
		display: grid;
		place-items: center;
	}
</style>
