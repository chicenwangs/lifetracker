<!-- FR-H8 (DesktopWeek.dc.html): 7-col time grid + all-day row | right: due soon (no block), unscheduled, stats. -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import WeekCalendar from '$lib/components/WeekCalendar.svelte';
	import { patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { calendarBus } from '$lib/client/bus.svelte';
	import { colorsFor } from '$lib/colors';
	import { openItem } from '$lib/client/peek.svelte';
	import { addDays, isoPlus, localToUtc, prettyDate } from '$lib/time';

	let { data } = $props();
	let side: HTMLElement | undefined = $state();
	const tz = $derived(data.user?.timezone ?? 'Asia/Kuala_Lumpur');

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
	const title = $derived.by(() => {
		const a = data.from;
		const b = addDays(data.to, -1);
		const ma = MONTHS[Number(a.slice(5, 7)) - 1];
		const mb = MONTHS[Number(b.slice(5, 7)) - 1];
		return ma === mb
			? `${Number(a.slice(8))} – ${Number(b.slice(8))} ${ma} ${b.slice(0, 4)}`
			: `${Number(a.slice(8))} ${ma} – ${Number(b.slice(8))} ${mb} ${b.slice(0, 4)}`;
	});

	const refresh = () => invalidateAll();
	const go = (w: string) => goto(`/week?w=${w}`, { keepFocus: true, noScroll: true, replaceState: true });
	const wrap = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await refresh();
		} catch (e) {
			showError(e);
			throw e;
		}
	};

	async function moveItem(id: string, date: string, endDate: string | null) {
		const orig = data.cal.items.find((i) => i.id === id);
		await wrap(() => patch(`/api/items/${id}`, { date, endDate }));
		if (orig?.date)
			showToast(`Moved "${orig.title}" to ${prettyDate(date)}`, {
				undo: () => wrap(() => patch(`/api/items/${id}`, { date: orig.date, endDate: orig.endDate })),
			});
	}

	async function dropItem(id: string, date: string, minutes: number | null) {
		const it = data.unscheduled.find((i) => i.id === id) ?? data.dueSoon.find((i) => i.id === id);
		await wrap(async () => {
			if (it && !it.date) await patch(`/api/items/${id}`, { date });
			if (minutes !== null) {
				const s = localToUtc(date, minutes, tz);
				await post('/api/blocks', { itemId: id, startAt: s, endAt: isoPlus(s, 3_600_000) });
			}
		}).catch(() => {});
	}

	async function createBlock(startAt: string, endAt: string) {
		const label = prompt('New block: what?')?.trim();
		if (!label) return;
		await wrap(() => post('/api/blocks', { label, startAt, endAt })).catch(() => {});
	}

	$effect(() => {
		void calendarBus.version;
		untrack(() => calendarBus.version > 0 && refresh());
	});
	onMount(() => {
		const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 60_000);
		return () => clearInterval(t);
	});
</script>

<svelte:head><title>Week · Life Tracker</title></svelte:head>

<main class="wrap">
	<section class="card wkc" aria-label="Week">
		<div class="bar">
			<button
				class="round"
				type="button"
				aria-label="Previous week"
				onclick={() => go(addDays(data.from, -7))}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg
				>
			</button>
			<h1>{title}</h1>
			<button class="round" type="button" aria-label="Next week" onclick={() => go(addDays(data.from, 7))}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg
				>
			</button>
			<button class="btn sm" type="button" onclick={() => go(data.today)}>Today</button>
			<div class="sp"></div>
			<div class="view" role="group" aria-label="View">
				<a href="/?m={data.from.slice(0, 7)}">Month</a>
				<span class="on">Week</span>
			</div>
		</div>
		{#if side}
			<WeekCalendar
				from={data.from}
				{tz}
				items={data.cal.items}
				blocks={data.cal.blocks}
				dragSource={side}
				oncycleitem={(id) => wrap(() => post(`/api/items/${id}/cycle`)).catch(() => {})}
				oncycleblock={(id) => wrap(() => post(`/api/blocks/${id}/cycle`)).catch(() => {})}
				onmoveitem={moveItem}
				onmoveblock={(id, s, e) => wrap(() => patch(`/api/blocks/${id}`, { startAt: s, endAt: e }))}
				oncreateblock={createBlock}
				ondropitem={dropItem}
				onopen={openItem}
			/>
		{/if}
		<div class="foot">
			Drag on empty time to add a block · drag blocks to move, edges to resize · drag items from the right
			onto a day
		</div>
	</section>

	<aside class="side" aria-label="To schedule" bind:this={side}>
		<div class="card box">
			<h2>Due soon, no time blocked</h2>
			<span class="hint">Dated items with no planner block yet. Drag onto a day to block time.</span>
			{#each data.dueSoon as i (i.id)}
				{@const c = colorsFor(i.type)}
				<div class="row" data-lt-item={i.id} data-title={i.title} style:border-left-color={c.ink}>
					<a
						href="/item/{i.id}"
						onclick={(e) => {
							e.preventDefault();
							openItem(i.id);
						}}>{i.title}</a
					>
					<span class="muted">{i.date ? prettyDate(i.date).split(' ').slice(0, 3).join(' ') : ''}</span>
				</div>
			{:else}
				<span class="muted">All due items have time blocked.</span>
			{/each}
		</div>
		<div class="card box">
			<h2>Unscheduled (no date)</h2>
			{#each data.unscheduled as i (i.id)}
				{@const c = colorsFor(i.type)}
				<div class="row" data-lt-item={i.id} data-title={i.title} style:border-left-color={c.ink}>
					<a
						href="/item/{i.id}"
						onclick={(e) => {
							e.preventDefault();
							openItem(i.id);
						}}>{i.title}</a
					><span class="muted">drag onto a day</span>
				</div>
			{:else}
				<span class="muted">Nothing unscheduled.</span>
			{/each}
		</div>
		<div class="card box stats">
			<h2>This week</h2>
			<div><span>Completed</span><b>{data.stats.done} items</b></div>
			<div><span>In progress</span><b>{data.stats.doing} items</b></div>
			<div><span>Blocked time</span><b>{data.stats.blockedH} h</b></div>
		</div>
	</aside>
</main>

<style>
	.wrap {
		padding: 20px 24px;
		display: flex;
		gap: 20px;
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.wkc {
		flex: 2 1 720px;
		min-width: 0;
		overflow: hidden;
	}
	.side {
		flex: 1 1 300px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.bar {
		padding: 16px 20px;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--rule);
	}
	h1 {
		font-size: 20px;
		font-weight: 700;
	}
	h2 {
		font-size: 15px;
		font-weight: 700;
	}
	.round {
		width: 32px;
		height: 32px;
		border-radius: 16px;
		border: 1px solid var(--border);
		background: var(--card);
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.sp {
		flex: 1;
	}
	.view {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		font-size: 12px;
	}
	.view > * {
		height: 32px;
		padding: 0 12px;
		display: flex;
		align-items: center;
		color: var(--ink);
	}
	.view .on {
		background: var(--ink);
		color: var(--on-ink);
		font-weight: 600;
	}
	.foot {
		padding: 10px 20px;
		font-size: 12px;
		color: var(--quiet);
		border-top: 1px solid var(--rule);
	}
	.box {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		border: 1px solid var(--rule);
		border-left: 4px solid;
		border-radius: 8px;
		cursor: grab;
		font-size: 13px;
		background: var(--card);
	}
	.row a {
		color: var(--ink);
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row span {
		flex: none;
		font-size: 12px;
	}
	.stats div {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
	}
</style>
