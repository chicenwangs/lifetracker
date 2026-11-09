<!-- FR-H2..H7, H13. FullCalendar dayGridMonth (MIT plugins). Feeds local strings from lib/time (no FC tz tricks). -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Calendar, type EventInput } from '@fullcalendar/core';
	import dayGridPlugin from '@fullcalendar/daygrid';
	import interactionPlugin from '@fullcalendar/interaction';
	import {
		examCountdown,
		fcDropToItem,
		itemToFc,
		makeDate,
		monthLabel,
		prettyDate,
		prettyTime,
	} from '$lib/time';
	import { colorsFor, typeClass } from '$lib/colors';
	import { badge, entryColors, theirClasses } from '$lib/client/partner';
	import OverlapToggle from './OverlapToggle.svelte';
	import SlotCommand from './SlotCommand.svelte';
	import type { ItemDTO, Status } from '$lib/types';

	let {
		items,
		year,
		month,
		today,
		selected,
		oncycle,
		onmove,
		onopen,
		onpick,
		ondropout,
		onnav,
		ontoday,
		ondelete,
	}: {
		items: ItemDTO[];
		year: number;
		month: number;
		today: string;
		selected: string;
		oncycle: (id: string) => void;
		onmove: (id: string, date: string, endDate: string | null) => Promise<void>;
		onopen: (id: string) => void;
		onpick: (date: string) => void;
		ondropout: (id: string, x: number, y: number) => boolean;
		onnav: (year: number, month: number) => void;
		ontoday?: () => void;
		ondelete: (id: string) => void;
	} = $props();

	let el: HTMLDivElement;
	let cal: Calendar | null = null;

	const ARIA: Record<Status, string> = {
		todo: 'Not started. Click to start',
		doing: 'In progress. Click to complete',
		done: 'Completed. Click to reset',
	};
	const SVG_DOING =
		'<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.5l6 3.5-6 3.5z" fill="currentColor"/></svg>';
	const SVG_DONE =
		'<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

	const SVG_X =
		'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.3" fill="var(--card)" stroke="currentColor" stroke-width="1.1"/><path d="M4.2 4.2l3.6 3.6M7.8 4.2L4.2 7.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

	function toEvents(list: ItemDTO[]): EventInput[] {
		const out: EventInput[] = [];
		for (const i of list) {
			const fc = itemToFc(i);
			if (!fc) continue;
			const c = entryColors(i);
			out.push({
				id: i.id,
				title: i.title,
				...fc,
				allDay: true, // month grid: all chips are blocks; time shown in label (time kept on drag)
				end: fc.allDay ? fc.end : i.endDate ? fc.end : undefined,
				editable: i.editable,
				durationEditable: false,
				backgroundColor: c.bg,
				borderColor: c.line,
				textColor: c.ink,
				classNames: [
					'lt-chip',
					typeClass(i.type),
					...(i.status === 'done' ? ['is-done'] : []),
					...theirClasses(i),
				],
				extendedProps: { item: i },
			});
		}
		return out;
	}

	function content(arg: { event: { extendedProps: Record<string, unknown> } }) {
		const it = arg.event.extendedProps.item as ItemDTO;
		const c = colorsFor(it.type);
		const wrap = document.createElement('div');
		wrap.className = 'lt-inner';
		if (it.theirs && it.owner) {
			// shared, read-only: badge + text, no square / link / delete
			const t = document.createElement('span');
			t.className = 'lt-title';
			t.textContent = (it.time ? `${prettyTime(it.time)} ` : '') + it.title;
			t.title = `${it.owner.name}: ${t.textContent}`;
			wrap.append(badge(it.owner), t);
			return { domNodes: [wrap] };
		}
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'lt-sq' + (it.status === 'done' ? ' on' : '');
		btn.style.setProperty('--ink', c.ink);
		btn.setAttribute('aria-label', `${it.title}: ${ARIA[it.status]}`);
		btn.title = ARIA[it.status];
		btn.innerHTML = it.status === 'doing' ? SVG_DOING : it.status === 'done' ? SVG_DONE : '';
		const stop = (e: Event) => e.stopPropagation();
		btn.addEventListener('mousedown', stop);
		btn.addEventListener('pointerdown', stop);
		btn.addEventListener('touchstart', stop);
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			oncycle(it.id);
		});
		const t = document.createElement('a');
		t.className = 'lt-title';
		t.href = `/item/${it.id}`;
		t.textContent = (it.time ? `${prettyTime(it.time)} ` : '') + it.title;
		t.title = t.textContent + (it.stepsTotal ? ` (${it.stepsDone}/${it.stepsTotal} steps)` : '');
		t.draggable = false;
		t.addEventListener('click', (e) => {
			e.preventDefault();
			onopen(it.id);
		});
		wrap.append(btn, t);
		const cd = examCountdown(it, today);
		if (cd) {
			const b = document.createElement('span');
			b.className = 'lt-dl' + (cd.days <= 3 ? ' soon' : '');
			b.textContent = cd.short;
			b.title = cd.long;
			wrap.append(b);
		}
		if (it.editable) {
			const x = document.createElement('button');
			x.type = 'button';
			x.className = 'lt-x';
			x.setAttribute('aria-label', `Delete ${it.title}`);
			x.title = 'Delete';
			x.innerHTML = SVG_X;
			x.addEventListener('mousedown', stop);
			x.addEventListener('pointerdown', stop);
			x.addEventListener('touchstart', stop);
			x.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				ondelete(it.id);
			});
			wrap.append(x);
		}
		return { domNodes: [wrap] };
	}

	onMount(() => {
		cal = new Calendar(el, {
			plugins: [dayGridPlugin, interactionPlugin],
			initialView: 'dayGridMonth',
			initialDate: makeDate(year, month, 1),
			firstDay: 1,
			headerToolbar: false,
			height: 'auto',
			fixedWeekCount: true,
			dayMaxEvents: 4,
			eventDisplay: 'block',
			displayEventTime: false,
			editable: true,
			eventStartEditable: true,
			eventDurationEditable: false,
			dragRevertDuration: 0,
			events: toEvents(items),
			eventContent: content,
			eventOrder: 'start,title',
			dayHeaderFormat: { weekday: 'short' },
			dayCellClassNames: (a) => {
				const d = a.date;
				const s = makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
				return [s === today ? 'lt-today' : '', s === selected ? 'lt-sel' : ''].filter(Boolean);
			},
			dateClick: (a) => onpick(a.dateStr),
			dayCellDidMount: (a) => {
				const d = a.date;
				const s = makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
				if (a.el.dataset.ltDbl) return; // one listener per cell, even if FullCalendar re-mounts it
				a.el.dataset.ltDbl = '1';
				a.el.addEventListener('dblclick', (ev) => {
					// chips, squares, delete and "+more" keep their own clicks
					if ((ev.target as HTMLElement).closest('.fc-event, .fc-daygrid-more-link, .fc-popover')) return;
					openDay(s, a.el, ev);
				});
			},
			eventDrop: async (info) => {
				const it = info.event.extendedProps.item as ItemDTO;
				const { date, endDate } = fcDropToItem(it, info.event.startStr);
				try {
					await onmove(it.id, date, endDate);
				} catch {
					info.revert();
				}
			},
			eventDragStop: (info) => {
				const e = info.jsEvent as MouseEvent;
				const r = el.getBoundingClientRect();
				const inside =
					e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
				if (!inside) ondropout(info.event.id, e.clientX, e.clientY);
			},
		});
		cal.render();
	});

	// ---------- double-click a day -> command box (like dragging empty time on Week) ----------
	let slot = $state<{ key: number; date: string; x: number; y: number } | null>(null);
	let slotSeq = 0;
	let slotCell: HTMLElement | null = null;
	function openDay(date: string, cell: HTMLElement, ev: MouseEvent) {
		window.getSelection()?.removeAllRanges();
		slotCell?.classList.remove('lt-adding');
		slotCell = cell;
		cell.classList.add('lt-adding');
		const W = 340;
		const H = 140;
		slot = {
			key: ++slotSeq,
			date,
			x: Math.max(12, Math.min(ev.clientX + 12, window.innerWidth - W - 12)),
			y: Math.max(12, Math.min(ev.clientY + 12, window.innerHeight - H - 12)),
		};
	}
	function closeDay() {
		slotCell?.classList.remove('lt-adding');
		slotCell = null;
		slot = null;
	}
	const dayLabel = (d: string) => prettyDate(d).split(' ').slice(0, 3).join(' ');

	onDestroy(() => cal?.destroy());

	// re-feed on data change
	$effect(() => {
		const evs = toEvents(items);
		if (!cal) return;
		cal.batchRendering(() => {
			cal?.removeAllEvents();
			cal?.addEventSource(evs);
		});
	});
	$effect(() => {
		cal?.gotoDate(makeDate(year, month, 1));
	});
	$effect(() => {
		void today;
		void selected;
		cal?.render();
	});

	const prev = () => (month === 1 ? onnav(year - 1, 12) : onnav(year, month - 1));
	const next = () => (month === 12 ? onnav(year + 1, 1) : onnav(year, month + 1));
</script>

<section class="card cal" aria-label="Calendar">
	<div class="bar strip strip-a">
		<button class="round" type="button" aria-label="Previous month" onclick={prev}>
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
		<h1>{monthLabel(year, month)}</h1>
		<button class="round" type="button" aria-label="Next month" onclick={next}>
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
		<button
			class="btn sm"
			type="button"
			onclick={() => (ontoday ? ontoday() : onnav(Number(today.slice(0, 4)), Number(today.slice(5, 7))))}
			>Today</button
		>
		<div class="sp"></div>
		<OverlapToggle />
		<div class="view" role="group" aria-label="View">
			<span class="on">Month</span>
			<a href="/week">Week</a>
		</div>
	</div>
	<div class="legend" aria-label="Type colours">
		{#each ['Work', 'Exam', 'Event', 'Hobby', 'Dating'] as const as t (t)}
			<span class="lg {typeClass(t)}">{t}</span>
		{/each}
	</div>
	<div class="grid" bind:this={el}></div>
	<div class="foot">
		Square: empty = not started · ▶ = in progress · ✓ = done · drag an item to another day to move it · drag
		it onto the planner to block time · double-click a day to add
	</div>
</section>

{#if slot}
	<div
		class="slotpop card"
		style:left="{slot.x}px"
		style:top="{slot.y}px"
		role="dialog"
		tabindex="-1"
		aria-label="New entry"
		onkeydown={(e) => e.key === 'Escape' && closeDay()}
	>
		<div class="sp-h">
			<span>{dayLabel(slot.date)} · all day</span>
			<button type="button" class="x" aria-label="Cancel" onclick={closeDay}>×</button>
		</div>
		{#key slot.key}
			<SlotCommand date={slot.date} day ondone={closeDay} oncancel={closeDay} />
		{/key}
	</div>
{/if}

<style>
	.cal {
		overflow: hidden;
		min-width: 0;
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
		min-width: 190px;
		text-align: center;
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
	.view a:hover {
		background: var(--ground);
		text-decoration: none;
	}
	.legend {
		padding: 8px 20px;
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--rule);
	}
	.lg {
		height: 22px;
		padding: 0 8px;
		border-radius: 5px;
		background: var(--bg);
		color: var(--fg);
		font-size: 11px;
		font-weight: 600;
		display: flex;
		align-items: center;
	}
	.foot {
		padding: 10px 20px;
		font-size: 12px;
		color: var(--quiet);
		border-top: 1px solid var(--rule);
	}

	/* ---- FullCalendar overrides ---- */
	.grid:global(.fc) {
		--fc-border-color: var(--rule);
		--fc-today-bg-color: transparent;
		--fc-page-bg-color: var(--card);
		--fc-neutral-bg-color: var(--ground);
		--fc-more-link-bg-color: var(--rule);
		font-size: 12px;
	}
	.grid :global(.fc-scrollgrid) {
		border-left: 0 !important;
		border-right: 0 !important;
	}
	.grid :global(.fc-col-header-cell) {
		padding: 8px 0;
		text-align: left;
	}
	.grid :global(.fc-col-header-cell-cushion) {
		padding: 0 10px !important;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--quiet);
		text-transform: uppercase;
		text-decoration: none !important;
	}
	.grid :global(.fc-daygrid-day-frame) {
		min-height: 104px;
		cursor: pointer;
	}
	.grid :global(.fc-daygrid-day-top) {
		flex-direction: row;
	}
	.grid :global(.fc-daygrid-day-number) {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink);
		padding: 6px 8px 2px !important;
		text-decoration: none !important;
	}
	.grid :global(.fc-day-other .fc-daygrid-day-number) {
		color: var(--faint);
	}
	.grid :global(.lt-today .fc-daygrid-day-number) {
		border-radius: 12px;
		margin: 4px;
		padding: 2px 7px !important;
		background: var(--today);
		color: var(--today-ink);
	}
	.grid:global(.fc) :global(.fc-daygrid-day.fc-day-today) {
		background: transparent !important;
	}
	.grid :global(.lt-sel) {
		box-shadow: inset 0 0 0 2px var(--today);
	}
	.grid :global(.lt-chip) {
		border-radius: 5px !important;
		margin: 1px 4px 2px !important;
		padding: 2px 4px !important;
		border: 0 !important;
		box-shadow: inset 0 0 0 1px var(--line);
		cursor: grab;
	}
	.grid :global(.lt-inner) {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		color: var(--fg);
	}
	.grid :global(.lt-sq) {
		flex: none;
		width: 16px;
		height: 16px;
		padding: 0;
		border-radius: 4px;
		border: 1.5px solid var(--ink);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		background: transparent;
	}
	.grid :global(.lt-sq.on) {
		background: var(--ink);
		color: var(--bg, var(--on-ink));
	}
	.grid :global(.lt-title) {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: inherit;
		font-weight: 600;
		font-size: 12px;
	}
	.grid :global(.lt-title:hover) {
		text-decoration: underline;
		color: inherit;
	}
	.grid :global(.lt-dl) {
		flex: none;
		font-size: 10px;
		font-weight: 700;
		padding: 0 5px;
		height: 16px;
		line-height: 16px;
		border-radius: 4px;
		border: 1px solid currentColor;
		white-space: nowrap;
	}
	.grid :global(.lt-dl.soon) {
		background: var(--exam-ink);
		color: var(--exam-bg);
		border-color: var(--exam-ink);
	}
	.grid :global(.lt-x) {
		flex: none;
		width: 14px;
		height: 14px;
		padding: 0;
		margin-left: -2px;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		display: none;
		align-items: center;
		justify-content: center;
	}
	.grid :global(.lt-chip:hover .lt-x),
	.grid :global(.lt-x:focus-visible) {
		display: flex;
	}
	.grid :global(.lt-x:hover circle) {
		fill: currentColor;
	}
	.grid :global(.lt-x:hover path) {
		stroke: var(--card);
	}
	.grid :global(.is-done .lt-title) {
		text-decoration: line-through;
	}
	.grid :global(.fc-daygrid-more-link) {
		color: var(--quiet);
		font-weight: 600;
		margin-left: 6px;
	}
	.grid :global(.fc-event-dragging) {
		box-shadow: 0 6px 16px rgb(0 0 0 / 0.2);
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

	/* double-click a day: same popup as the Week page */
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
		animation: lt-pop 160ms var(--ease) both;
		transform-origin: top left;
	}
	.sp-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		color: var(--quiet);
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
	.grid :global(.lt-adding) {
		outline: 1.5px dashed var(--ink);
		outline-offset: -3px;
		background: color-mix(in srgb, var(--pill-card) 35%, transparent);
	}
</style>
