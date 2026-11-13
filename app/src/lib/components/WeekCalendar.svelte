<!-- FR-H8. FullCalendar timeGridWeek: blocks in time grid (drag/resize 15 min), items in all-day row (drag = date).
     External drops (data-lt-item elements) -> time slot = 60-min linked block, all-day row = set date. -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Calendar, type EventInput } from '@fullcalendar/core';
	import timeGridPlugin from '@fullcalendar/timegrid';
	import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
	import { blockType, colorsFor, typeClass } from '$lib/colors';
	import { badge, entryColors, theirClasses } from '$lib/client/partner';
	import RollHandle from './RollHandle.svelte';
	import { page } from '$app/state';
	import { hoursState } from '$lib/client/hours.svelte';
	import { DEFAULT_HOURS, pad2, type HourRange } from '$lib/hours';
	import { layoutDay } from '$lib/planner-layout';
	import {
		addDays,
		diffDays,
		fcDropToItem,
		hhmm,
		itemToFc,
		localToUtc,
		minutesOf,
		prettyTime,
		utcToLocal,
	} from '$lib/time';
	import type { BlockDTO, ItemDTO, Status } from '$lib/types';

	const us = page.data.user?.region === 'us';
	let {
		from,
		tz,
		items,
		blocks,
		dragSource,
		oncycleitem,
		oncycleblock,
		onmoveitem,
		onmoveblock,
		oncreateblock,
		ondropitem,
		onopen,
		ondelete,
		onblockout,
		ondragging,
	}: {
		from: string;
		tz: string;
		items: ItemDTO[];
		blocks: BlockDTO[];
		dragSource?: HTMLElement;
		oncycleitem: (id: string) => void;
		oncycleblock: (id: string) => void;
		onmoveitem: (id: string, date: string, endDate: string | null) => Promise<void>;
		onmoveblock: (id: string, startAt: string, endAt: string) => Promise<void>;
		/** empty-slot drag: local day + minutes (end may pass 1440) + where the pointer let go */
		oncreateblock: (date: string, start: number, end: number, at: { x: number; y: number }) => void;
		ondropitem: (id: string, date: string, minutes: number | null) => void;
		onopen: (id: string) => void;
		/** hover ⊗, same as Home */
		ondelete: (kind: 'item' | 'block', id: string, label: string) => void;
		/** a block was dragged outside the grid; true = handled (dropped on Not scheduled) */
		onblockout: (id: string, x: number, y: number) => boolean;
		ondragging?: (kind: 'block' | 'item' | null) => void;
	} = $props();

	let el: HTMLDivElement;
	let wrapEl: HTMLDivElement;
	let quiet = false;

	// ---------- visible hours (shared with the Home planner) ----------
	const GAP = 20; // all-day row | hourly grid gap, also where the top roll handle lives
	const hr = $derived<HourRange>(
		hoursState.ready ? hoursState : ((page.data.hours as HourRange | undefined) ?? DEFAULT_HOURS),
	);
	let geo = $state<{ top: number; bottom: number; left: number; width: number; hourPx: number } | null>(null);
	function measure() {
		const slots = el?.querySelector('.fc-timegrid-slots');
		if (!slots || !wrapEl) return;
		const w = wrapEl.getBoundingClientRect();
		const r = slots.getBoundingClientRect();
		geo = {
			top: r.top - w.top,
			bottom: r.bottom - w.top,
			left: r.left - w.left,
			width: r.width,
			hourPx: r.height / Math.max(1, hr.end - hr.start),
		};
	}
	const remeasure = () => requestAnimationFrame(measure);
	const hiddenWeek = $derived.by(() => {
		const top: string[] = [];
		const bot: string[] = [];
		for (let d = 0; d < 7; d++) {
			for (const p of layoutDay(blocks, addDays(from, d), tz)) {
				if (p.bottom <= hr.start * 60) top.push(p.b.label);
				else if (p.top >= hr.end * 60) bot.push(p.b.label);
			}
		}
		return { top: [...new Set(top)], bot: [...new Set(bot)] };
	});

	/** live preview of a typed range in the grid (first day only when it crosses midnight) */
	export function showSlot(date: string, start: number, end: number) {
		if (!cal) return;
		const e = Math.min(end, 1440);
		quiet = true;
		try {
			cal.select(
				`${date}T${hhmm(start)}:00`,
				e >= 1440 ? `${addDays(date, 1)}T00:00:00` : `${date}T${hhmm(e)}:00`,
			);
		} finally {
			quiet = false;
		}
	}
	export function clearSlot() {
		cal?.unselect();
	}
	let cal: Calendar | null = null;
	let drag: Draggable | null = null;

	const ARIA: Record<Status, string> = {
		todo: 'Not started. Click to start',
		doing: 'In progress. Click to complete',
		done: 'Completed. Click to reset',
	};
	const SVG: Record<Status, string> = {
		todo: '',
		doing:
			'<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.5l6 3.5-6 3.5z" fill="currentColor"/></svg>',
		done: '<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
	};

	const SVG_X =
		'<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--card)" stroke="currentColor" stroke-width="1.4"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
	function xButton(label: string, fn: () => void) {
		const x = document.createElement('button');
		x.type = 'button';
		x.className = 'lt-x';
		x.setAttribute('aria-label', `Delete ${label}`);
		x.title = 'Delete';
		x.innerHTML = SVG_X;
		const stop = (e: Event) => e.stopPropagation();
		x.addEventListener('mousedown', stop);
		x.addEventListener('pointerdown', stop);
		x.addEventListener('touchstart', stop);
		x.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			fn();
		});
		return x;
	}

	const hourBand = (t?: { milliseconds: number }) => Math.floor((t?.milliseconds ?? 0) / 3_600_000) % 2 === 1;

	/** FC local string -> {date, minutes} (string parts only; no browser-tz math) */
	const parts = (s: string) => ({
		date: s.slice(0, 10),
		minutes: s.length > 10 ? minutesOf(s.slice(11, 16)) : null,
	});

	function events(): EventInput[] {
		const out: EventInput[] = [];
		for (const i of items) {
			const fc = itemToFc(i);
			if (!fc) continue;
			const c = entryColors(i);
			out.push({
				id: `i:${i.id}`,
				title: i.title,
				start: i.date ?? undefined,
				end: i.endDate ? addDays(i.endDate, 1) : undefined,
				allDay: true,
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
				extendedProps: { kind: 'item', item: i },
			});
		}
		for (const b of blocks) {
			const s = utcToLocal(b.startAt, tz);
			const e = utcToLocal(b.endAt, tz);
			const c = entryColors(b);
			out.push({
				id: `b:${b.id}`,
				title: b.label,
				start: `${s.date}T${s.time}:00`,
				end: `${e.date}T${e.time}:00`,
				allDay: false,
				editable: b.editable,
				backgroundColor: c.bg,
				borderColor: c.line,
				textColor: c.ink,
				classNames: [
					'lt-blk',
					typeClass(blockType(b)),
					...(b.status === 'done' ? ['is-done'] : []),
					...theirClasses(b),
				],
				extendedProps: { kind: 'block', block: b, ink: c.ink },
			});
		}
		return out;
	}

	function square(status: Status, ink: string, label: string, fn: () => void) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'lt-sq' + (status === 'done' ? ' on' : '');
		btn.style.setProperty('--ink', ink);
		btn.setAttribute('aria-label', `${label}: ${ARIA[status]}`);
		btn.title = ARIA[status];
		btn.innerHTML = SVG[status];
		const stop = (e: Event) => e.stopPropagation();
		btn.addEventListener('mousedown', stop);
		btn.addEventListener('pointerdown', stop);
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			fn();
		});
		return btn;
	}

	onMount(() => {
		cal = new Calendar(el, {
			plugins: [timeGridPlugin, interactionPlugin],
			initialView: 'timeGridWeek',
			initialDate: from,
			firstDay: us ? 0 : 1,
			headerToolbar: false,
			height: 'auto',
			contentHeight: 'auto',
			slotMinTime: `${pad2(hr.start)}:00:00`,
			slotMaxTime: `${pad2(hr.end)}:00:00`,
			expandRows: false,
			allDaySlot: true,
			allDayText: 'all day',
			slotDuration: '00:30:00',
			snapDuration: '00:15:00',
			slotLabelInterval: '01:00',
			// every other hour gets a darker band so a drag's length can be read at a glance
			slotLaneClassNames: (a) => (hourBand(a.time) ? ['lt-band'] : []),
			slotLabelClassNames: (a) => (hourBand(a.time) ? ['lt-band'] : []),
			slotLabelFormat: us ? { hour: 'numeric', meridiem: 'short' } : { hour: '2-digit', minute: '2-digit', hour12: false },
			nowIndicator: true,
			dayHeaderFormat: { weekday: 'short', day: 'numeric' },
			editable: true,
			selectable: true,
			selectMirror: true,
			droppable: true,
			eventDurationEditable: true,
			eventOverlap: true,
			displayEventTime: false,
			events: events(),
			eventContent: (arg) => {
				const p = arg.event.extendedProps as { kind: string; item?: ItemDTO; block?: BlockDTO; ink?: string };
				const wrap = document.createElement('div');
				wrap.className = 'lt-inner';
				if (p.kind === 'item' && p.item) {
					const it = p.item;
					const c = colorsFor(it.type);
					if (it.theirs && it.owner) wrap.append(badge(it.owner));
					else wrap.append(square(it.status, c.ink, it.title, () => oncycleitem(it.id)));
					const t = document.createElement('span');
					t.className = 'lt-title';
					t.textContent = (it.time ? `${prettyTime(it.time)} ` : '') + it.title;
					wrap.append(t);
					if (it.editable) wrap.append(xButton(it.title, () => ondelete('item', it.id, it.title)));
				} else if (p.block) {
					const b = p.block;
					if (b.theirs && b.owner) wrap.append(badge(b.owner));
					else wrap.append(square(b.status, p.ink ?? 'var(--ink)', b.label, () => oncycleblock(b.id)));
					const col = document.createElement('div');
					col.className = 'lt-col';
					const s = utcToLocal(b.startAt, tz);
					const e = utcToLocal(b.endAt, tz);
					col.innerHTML = '';
					const l = document.createElement('span');
					l.className = 'lt-title';
					l.textContent = b.label;
					const tm = document.createElement('span');
					tm.className = 'lt-time';
					tm.textContent = `${s.time} – ${e.time}`;
					col.append(l, tm);
					wrap.append(col);
					if (b.editable) wrap.append(xButton(b.label, () => ondelete('block', b.id, b.label)));
				}
				return { domNodes: [wrap] };
			},
			eventClick: (info) => {
				const p = info.event.extendedProps as { kind: string; item?: ItemDTO; block?: BlockDTO };
				info.jsEvent.preventDefault();
				if (p.item?.theirs || p.block?.theirs) return; // shared, read-only
				if (p.item) onopen(p.item.id);
				else if (p.block?.itemId) onopen(p.block.itemId);
			},
			eventDragStart: (info) => {
				const p = info.event.extendedProps as { kind: string };
				ondragging?.(p.kind === 'block' ? 'block' : 'item');
			},
			eventDragStop: (info) => {
				ondragging?.(null);
				const p = info.event.extendedProps as { block?: BlockDTO };
				const r = el.getBoundingClientRect();
				const { clientX: x, clientY: y } = info.jsEvent as MouseEvent;
				const outside = x < r.left || x > r.right || y < r.top || y > r.bottom;
				if (p.block && outside) onblockout(p.block.id, x, y);
			},
			eventDrop: async (info) => {
				const p = info.event.extendedProps as { kind: string; item?: ItemDTO; block?: BlockDTO };
				try {
					if (p.item) {
						if (!info.event.allDay) {
							info.revert();
							return;
						}
						const { date, endDate } = fcDropToItem(p.item, info.event.startStr);
						await onmoveitem(p.item.id, date, endDate);
					} else if (p.block) {
						if (info.event.allDay) {
							info.revert();
							return;
						}
						await toBlock(p.block.id, info.event.startStr, info.event.endStr);
					}
				} catch {
					info.revert();
				}
			},
			eventResize: async (info) => {
				const p = info.event.extendedProps as { block?: BlockDTO };
				if (!p.block) return info.revert();
				try {
					await toBlock(p.block.id, info.event.startStr, info.event.endStr);
				} catch {
					info.revert();
				}
			},
			unselectAuto: false,
			select: (info) => {
				if (quiet) return;
				if (info.allDay) {
					cal?.unselect();
					return;
				}
				const s = parts(info.startStr);
				const e = parts(info.endStr);
				const end = (e.minutes ?? 0) + 1440 * Math.max(0, diffDays(s.date, e.date));
				const r = (info.jsEvent?.target as HTMLElement | null)?.getBoundingClientRect();
				const at = info.jsEvent
					? { x: info.jsEvent.clientX, y: info.jsEvent.clientY }
					: { x: r?.left ?? 200, y: r?.top ?? 200 };
				oncreateblock(s.date, s.minutes ?? 0, end, at);
			},
			drop: (info) => {
				const id = (info.draggedEl as HTMLElement).dataset.ltItem;
				if (!id) return;
				const p = parts(info.dateStr);
				ondropitem(id, p.date, info.allDay ? null : p.minutes);
			},
		});
		cal.render();
		remeasure();
		const ro = new ResizeObserver(remeasure);
		ro.observe(el);
		cleanup.push(() => ro.disconnect());
		if (dragSource) {
			drag = new Draggable(dragSource, {
				itemSelector: '[data-lt-item]',
				eventData: (e) => ({
					title: (e as HTMLElement).dataset.title ?? '',
					duration: { minutes: page.data.user?.blockMin ?? 60 },
					create: false,
				}),
			});
		}
	});

	async function toBlock(id: string, startStr: string, endStr: string) {
		const s = parts(startStr);
		const e = parts(endStr || startStr);
		await onmoveblock(
			id,
			localToUtc(s.date, s.minutes ?? 0, tz),
			localToUtc(e.date, e.minutes ?? (s.minutes ?? 0) + (page.data.user?.blockMin ?? 60), tz),
		);
	}

	onDestroy(() => {
		cleanup.forEach((f) => f());
		drag?.destroy();
		cal?.destroy();
	});

	$effect(() => {
		void items;
		void blocks;
		const ev = events();
		cal?.batchRendering(() => {
			cal?.removeAllEvents();
			cal?.addEventSource(ev);
		});
	});
	$effect(() => {
		cal?.gotoDate(from);
	});
	$effect(() => {
		const a = `${pad2(hr.start)}:00:00`;
		const b = `${pad2(hr.end)}:00:00`;
		if (!cal) return;
		cal.setOption('slotMinTime', a);
		cal.setOption('slotMaxTime', b);
		remeasure();
	});
	const cleanup: (() => void)[] = [];
	void hhmm;
</script>

<div class="wkwrap" bind:this={wrapEl}>
	<div class="wk" bind:this={el}></div>
	{#if geo}
		<RollHandle
			edge="top"
			hourPx={geo.hourPx}
			hidden={hiddenWeek.top}
			pos={{ top: geo.top - GAP, left: geo.left, width: geo.width, height: GAP }}
		/>
		<RollHandle
			edge="bottom"
			hourPx={geo.hourPx}
			hidden={hiddenWeek.bot}
			pos={{ top: geo.bottom, left: geo.left, width: geo.width, height: GAP }}
		/>
	{/if}
</div>

<style>
	.wkwrap {
		position: relative;
		padding-bottom: 20px; /* room for the bottom roll handle */
	}
	/* clear gap between all-day items and the first hour (top roll handle sits in it) */
	.wk :global(.fc-timegrid-divider) {
		padding: 0 0 20px !important;
		background: var(--ground);
		border-top: 1px solid var(--rule);
	}
	.wk:global(.fc) {
		--fc-border-color: var(--rule);
		--fc-today-bg-color: var(--hover);
		--fc-page-bg-color: var(--card);
		--fc-neutral-bg-color: var(--ground);
		--fc-now-indicator-color: var(--ink);
		font-size: 12px;
	}
	/* drag / typed selection = same dashed draft look as the planner */
	.wk :global(.fc-event-mirror) {
		background: color-mix(in srgb, var(--card) 88%, transparent) !important;
		border: 1.5px dashed var(--ink) !important;
		border-radius: 8px;
		box-shadow: none !important;
	}
	.wk :global(.fc-event-mirror .fc-event-main) {
		color: var(--ink) !important;
		font-weight: 600;
		font-size: 11px;
	}
	/* the mirror above is the one visible box; FC's own highlight would draw a second one */
	.wk :global(.fc-highlight) {
		background: transparent !important;
		border: 0;
	}
	/* hour bands (odd hours) */
	.wk :global(.fc-timegrid-slot.lt-band) {
		background: var(--band);
	}
	/* today = light dotted outline down the whole column (header, all-day, hours), no fill */
	.wk:global(.fc) :global(.fc-day-today) {
		background: transparent !important;
	}
	.wk :global(.fc-col-header-cell.fc-day-today),
	.wk :global(.fc-day-today .fc-daygrid-day-frame),
	.wk :global(.fc-day-today .fc-timegrid-col-frame) {
		position: relative;
	}
	.wk :global(.fc-col-header-cell.fc-day-today)::after,
	.wk :global(.fc-day-today .fc-daygrid-day-frame)::after,
	.wk :global(.fc-day-today .fc-timegrid-col-frame)::after {
		content: '';
		position: absolute;
		inset: 0 1px;
		border-left: 1.5px dotted var(--today-line);
		border-right: 1.5px dotted var(--today-line);
		pointer-events: none;
		z-index: 1;
	}
	.wk :global(.fc-col-header-cell.fc-day-today)::after {
		border-top: 1.5px dotted var(--today-line);
		border-radius: 6px 6px 0 0;
	}
	.wk :global(.fc-day-today .fc-timegrid-col-frame)::after {
		border-bottom: 1.5px dotted var(--today-line);
	}
	.wk :global(.fc-col-header-cell-cushion) {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink);
		text-decoration: none !important;
		padding: 8px 4px !important;
	}
	.wk :global(.fc-timegrid-slot-label-cushion),
	.wk :global(.fc-timegrid-axis-cushion) {
		font-size: 11px;
		color: var(--quiet);
	}
	.wk :global(.fc-timegrid-slot) {
		height: 24px;
	}
	.wk :global(.fc-timegrid-slot-minor) {
		border-top-style: dotted;
	}
	.wk :global(.lt-chip),
	.wk :global(.lt-blk) {
		border-radius: 6px !important;
		border: 0 !important;
		padding: 2px 4px;
		cursor: grab;
	}
	/* timed blocks look like the Home planner's */
	.wk :global(.lt-blk) {
		border-radius: 8px !important;
		padding: 4px 6px;
	}
	.wk :global(.lt-blk .lt-inner) {
		gap: 6px;
	}
	.wk :global(.lt-blk .lt-sq) {
		width: 18px;
		height: 18px;
		border-radius: 5px;
	}
	.wk :global(.lt-blk .lt-title) {
		font-size: 12px;
	}
	.wk :global(.lt-inner) {
		position: relative;
	}
	.wk :global(.lt-x) {
		position: absolute;
		top: 0;
		right: 0;
		width: 16px;
		height: 16px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.12s;
		z-index: 2;
	}
	.wk :global(.lt-chip .lt-x) {
		width: 14px;
		height: 14px;
		top: 50%;
		translate: 0 -50%;
	}
	.wk :global(.fc-event:hover .lt-x),
	.wk :global(.lt-x:focus-visible) {
		opacity: 1;
	}
	.wk :global(.lt-x:hover circle) {
		fill: currentColor;
	}
	.wk :global(.lt-x:hover path) {
		stroke: var(--card);
	}
	.wk :global(.lt-chip),
	.wk :global(.lt-blk) {
		box-shadow: inset 0 0 0 1px var(--line, transparent);
	}
	.wk :global(.lt-inner) {
		display: flex;
		gap: 5px;
		align-items: flex-start;
		min-width: 0;
		height: 100%;
		overflow: hidden;
	}
	.wk :global(.lt-col) {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.wk :global(.lt-sq) {
		flex: none;
		width: 15px;
		height: 15px;
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
	.wk :global(.lt-sq.on) {
		background: var(--ink);
		color: var(--bg, var(--on-ink));
	}
	.wk :global(.lt-title) {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.wk :global(.lt-time) {
		font-size: 11px;
	}
	.wk :global(.is-done .lt-title) {
		text-decoration: line-through;
	}
</style>
