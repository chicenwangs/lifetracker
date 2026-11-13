<!-- FR-H8 (DesktopWeek.dc.html): 7-col time grid + all-day row.
     Right column (top to bottom): month heatmap with this week highlighted · Not scheduled (all-day items with
     no block; drag onto the grid to block time, drag a block here to unschedule it) · stats. -->
<script lang="ts">
	import { shown } from '$lib/client/itemtypes.svelte';
	import TypeBar from '$lib/components/TypeBar.svelte';
	import ScheduleButton from '$lib/components/ScheduleButton.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import WeekCalendar from '$lib/components/WeekCalendar.svelte';
	import PhoneWeek from '$lib/components/PhoneWeek.svelte';
	import SlotCommand from '$lib/components/SlotCommand.svelte';
	import WeekMap from '$lib/components/WeekMap.svelte';
	import OverlapToggle from '$lib/components/OverlapToggle.svelte';
	import { del } from '$lib/client/api';
	import { removeBlock, removeItem } from '$lib/client/remove';
	import type { QAParse } from '$lib/quickadd';
	import { patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { calendarBus } from '$lib/client/bus.svelte';
	import { colorsFor } from '$lib/colors';
	import { openItem } from '$lib/client/peek.svelte';
	import { addDays, diffDays, hhmm, isoPlus, localToUtc, prettyDate, utcToLocal } from '$lib/time';

	let { data } = $props();
	let side: HTMLElement | undefined = $state();
	let notEl: HTMLElement | undefined = $state();
	let dragging = $state<'block' | 'item' | null>(null);
	let weekCal: WeekCalendar | undefined = $state();
	// empty-slot drag -> command box (same grammar as N; default planner, /calendar optional)
	let slot = $state<{ key: number; date: string; start: number; end: number; x: number; y: number } | null>(
		null,
	);
	let slotSeq = 0;
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
		const it = data.notBlocked.find((i) => i.id === id);
		await wrap(async () => {
			if (it && !it.date) await patch(`/api/items/${id}`, { date });
			else if (it?.date && it.date !== date && minutes === null)
				await patch(`/api/items/${id}`, {
					date,
					endDate: it.endDate ? addDays(it.endDate, diffDays(it.date, date)) : null,
				});
			if (minutes !== null) {
				const s = localToUtc(date, minutes, tz);
				await post('/api/blocks', {
					itemId: id,
					startAt: s,
					endAt: isoPlus(s, (data.user?.blockMin ?? 60) * 60_000),
				});
			}
		}).catch(() => {});
	}

	function createBlock(date: string, start: number, end: number, at: { x: number; y: number }) {
		live = null;
		const W = 340;
		const H = 150;
		slot = {
			key: ++slotSeq,
			date,
			start,
			end,
			x: Math.max(12, Math.min(at.x + 12, window.innerWidth - W - 12)),
			y: Math.max(12, Math.min(at.y + 12, window.innerHeight - H - 12)),
		};
	}
	// ---------- block -> Not scheduled ----------
	function inside(el: HTMLElement | undefined, x: number, y: number) {
		const r = el?.getBoundingClientRect();
		return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	}
	function blockOut(id: string, x: number, y: number): boolean {
		if (!inside(notEl, x, y)) return false;
		void unschedule(id);
		return true;
	}
	/** linked block: drop the block (item stays, shows in the list). Plain block: becomes an all-day item. */
	async function unschedule(id: string) {
		const b = data.cal.blocks.find((x) => x.id === id);
		if (!b) return;
		try {
			// block first: if it fails nothing changed; if the item create fails, put the block back
			const { batch } = await del<{ batch?: string }>(`/api/blocks/${id}`);
			let made: string | null = null;
			if (!b.itemId) {
				try {
					const r = await post<{ item: { id: string } }>('/api/items', {
						title: b.label,
						type: b.type,
						date: utcToLocal(b.startAt, tz).date,
					});
					made = r.item.id;
				} catch (e) {
					if (batch) await post(`/api/trash/${batch}/restore`).catch(() => {});
					await refresh();
					throw e;
				}
			}
			await refresh();
			showToast(`Moved "${b.label}" to Not scheduled`, {
				undo: async () => {
					try {
						if (batch) await post(`/api/trash/${batch}/restore`);
						if (made) await del(`/api/items/${made}`);
					} catch (e) {
						showError(e);
					}
					await refresh();
				},
			});
		} catch (e) {
			showError(e);
		}
	}
	const onDelete = (kind: 'item' | 'block', id: string, label: string) =>
		kind === 'item' ? removeItem(id, label, refresh) : removeBlock(id, label, refresh);

	function closeSlot() {
		slot = null;
		live = null;
		weekCal?.clearSlot();
	}
	// typed day/time moves the grid selection live (only within the shown week)
	let live = $state<{ date: string; start: number; end: number; thin: boolean } | null>(null);
	function onSlotParsed(p: QAParse) {
		if (!slot || !weekCal) return;
		live = null;
		if (p.startMinutes === null) return weekCal.clearSlot();
		const thin = p.target === 'calendar';
		const end = thin ? p.startMinutes + 30 : (p.endMinutes ?? p.startMinutes + 60);
		live = { date: p.date, start: p.startMinutes, end, thin };
		if (p.date >= data.from && p.date < data.to) weekCal.showSlot(p.date, p.startMinutes, end);
		else weekCal.clearSlot();
	}
	const fmtSlot = (s: { date: string; start: number; end: number; thin?: boolean }) =>
		`${prettyDate(s.date).split(' ').slice(0, 3).join(' ')} · ${hhmm(s.start)}` +
		(s.thin
			? ' · calendar item'
			: ` – ${s.end === 1440 ? '24:00' : hhmm(s.end)}${s.end > 1440 ? ' (+1 day)' : ''}`);

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

<!-- phone (< 700 px): read-first agenda; the grid below is for the PC -->
<main class="phone" aria-label="Week agenda">
	<div class="pbar">
		<a class="btn sm" href="/week?w={addDays(data.from, -7)}" aria-label="Previous week">‹</a>
		<strong
			>{prettyDate(data.from).replace(/ d{4}$/, '')} – {prettyDate(addDays(data.to, -1)).replace(
				/ d{4}$/,
				'',
			)}</strong
		>
		<a class="btn sm" href="/week?w={addDays(data.from, 7)}" aria-label="Next week">›</a>
	</div>
	<PhoneWeek from={data.from} to={data.to} today={data.today} {tz} cal={data.cal} />
</main>

<main class="wrap">
	<section class="card wkc" aria-label="Week">
		<div class="bar strip">
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
			<OverlapToggle />
			<div class="view" role="group" aria-label="View">
				<a href="/?m={data.from.slice(0, 7)}">Month</a>
				<span class="on">Week</span>
			</div>
		</div>
		<div class="types"><TypeBar /></div>
		{#if side}
			<WeekCalendar
				bind:this={weekCal}
				from={data.from}
				{tz}
				items={shown(data.cal.items)}
				blocks={shown(data.cal.blocks)}
				dragSource={side}
				oncycleitem={(id) => wrap(() => post(`/api/items/${id}/cycle`)).catch(() => {})}
				oncycleblock={(id) => wrap(() => post(`/api/blocks/${id}/cycle`)).catch(() => {})}
				onmoveitem={moveItem}
				onmoveblock={(id, s, e) => wrap(() => patch(`/api/blocks/${id}`, { startAt: s, endAt: e }))}
				oncreateblock={createBlock}
				ondropitem={dropItem}
				onopen={openItem}
				ondelete={onDelete}
				onblockout={blockOut}
				ondragging={(k) => (dragging = k)}
			/>
		{/if}
		<div class="foot">
			Drag on empty time, then type a title (/type, /calendar work too) · drag blocks to move, edges to resize
			· drag items from the right onto a day
		</div>
	</section>

	<aside class="side" aria-label="To schedule" bind:this={side}>
		<WeekMap
			year={data.month.year}
			month={data.month.month}
			heat={data.month.heat}
			from={data.from}
			today={data.today}
			ongo={go}
		/>
		<div
			class="card box notsch"
			class:drop={dragging === 'block'}
			bind:this={notEl}
			aria-label="Not scheduled"
			role="region"
		>
			<h2>Not scheduled <span class="n">{data.notBlocked.length}</span></h2>
			<span class="hint">
				{#if dragging === 'block'}Drop here to take it off the timeline{:else}All-day items this week with no
					time blocked. Drag onto the grid to block time; drag a block here to put it back.{/if}
			</span>
			{#each data.notBlocked as i (i.id)}
				{@const c = colorsFor(i.type)}
				<div class="row" data-lt-item={i.id} data-title={i.title} style:border-left-color={c.edge}>
					<a
						href="/item/{i.id}"
						onclick={(e) => {
							e.preventDefault();
							openItem(i.id);
						}}>{i.title}</a
					>
					<span class="muted"
						>{i.date ? prettyDate(i.date).split(' ').slice(0, 1).join(' ') : ''}{i.endDate
							? ` – ${prettyDate(i.endDate).split(' ')[0]}`
							: ''}</span
					>
					<ScheduleButton itemId={i.id} title={i.title} date={i.date ?? data.from} />
					<button
						type="button"
						class="rx"
						aria-label="Delete {i.title}"
						title="Delete"
						onclick={() => onDelete('item', i.id, i.title)}
						><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"
							><circle cx="8" cy="8" r="7" fill="var(--card)" stroke="currentColor" stroke-width="1.4" /><path
								d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
							/></svg
						></button
					>
				</div>
			{:else}
				<span class="muted">Every all-day item this week has time blocked.</span>
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

{#if slot}
	<div
		class="slotpop card"
		style:left="{slot.x}px"
		style:top="{slot.y}px"
		role="dialog"
		tabindex="-1"
		aria-label="New entry"
		onkeydown={(e) => e.key === 'Escape' && closeSlot()}
	>
		<div class="sp-h">
			<span>{fmtSlot(live ?? slot)}</span>
			<button type="button" class="x" aria-label="Cancel" onclick={closeSlot}>×</button>
		</div>
		{#key slot.key}
			<SlotCommand
				date={slot.date}
				start={slot.start}
				end={slot.end}
				onparsed={onSlotParsed}
				ondone={() => {
					closeSlot();
					refresh();
				}}
				oncancel={closeSlot}
			/>
		{/key}
	</div>
{/if}

<style>
	.types {
		padding: 8px 20px;
		border-bottom: 1px solid var(--rule);
	}
	.slotpop {
		position: fixed;
		z-index: 60;
		width: 340px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border: 1.5px dashed var(--ink);
		box-shadow: var(--shadow-card);
	}
	.sp-h {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		font-weight: 600;
	}
	.x {
		border: 0;
		background: none;
		color: var(--quiet);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}
	.phone {
		display: none;
		padding: 8px 12px 104px;
	}
	.pbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}
	@media (max-width: 699px) {
		.phone {
			display: block;
		}
		.wrap {
			display: none !important;
		}
	}
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
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--rule);
		background: var(--strip-a);
		padding: 14px 20px;
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
		border: 1.5px solid var(--border);
		background: var(--card);
		box-shadow: var(--shadow-btn);
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
		border-radius: 8px;
		overflow: hidden;
		font-size: 12px;
		border: 1.5px solid var(--border);
		box-shadow: var(--shadow-btn);
	}
	.view > * {
		height: 32px;
		padding: 0 12px;
		display: flex;
		align-items: center;
		color: var(--ink);
	}
	.view .on {
		background: var(--seg-on);
		color: var(--seg-on-ink);
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
	.notsch {
		transition:
			outline-color 0.12s,
			background-color 0.12s;
		outline: 2px dashed transparent;
		outline-offset: -2px;
	}
	.notsch.drop {
		outline-color: var(--ink);
		background: var(--hover);
	}
	.n {
		font-size: 12px;
		font-weight: 600;
		color: var(--quiet);
		margin-left: 4px;
	}
	.hint {
		font-size: 12px;
		color: var(--quiet);
	}
	.row .muted {
		margin-left: auto;
	}
	.rx {
		flex: none;
		width: 16px;
		height: 16px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.row:hover .rx,
	.rx:focus-visible {
		opacity: 1;
	}
	.rx:hover circle {
		fill: currentColor;
	}
	.rx:hover path {
		stroke: var(--card);
	}
	.stats div {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
	}

	/* motion */
	.round {
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease),
			background-color var(--t) var(--ease);
	}
	.round:hover {
		transform: translate(1px, -1px);
		box-shadow: -3px 3px 0 var(--accent);
	}
	.round:active {
		transform: translate(-2px, 2px);
		box-shadow: 0 0 0 var(--accent);
	}

	.slotpop {
		animation: lt-pop 160ms var(--ease) both;
		transform-origin: top left;
	}

	.row {
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.row:hover {
		box-shadow: -2px 2px 0 var(--accent);
	}
</style>
