<!-- FR-H8. FullCalendar timeGridWeek: blocks in time grid (drag/resize 15 min), items in all-day row (drag = date).
     External drops (data-lt-item elements) -> time slot = 60-min linked block, all-day row = set date. -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Calendar, type EventInput } from '@fullcalendar/core';
	import timeGridPlugin from '@fullcalendar/timegrid';
	import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
	import { blockType, colorsFor, typeClass } from '$lib/colors';
	import {
		addDays,
		fcDropToItem,
		hhmm,
		itemToFc,
		localToUtc,
		minutesOf,
		prettyTime,
		utcToLocal,
	} from '$lib/time';
	import type { BlockDTO, ItemDTO, Status } from '$lib/types';

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
		oncreateblock: (startAt: string, endAt: string) => void;
		ondropitem: (id: string, date: string, minutes: number | null) => void;
		onopen: (id: string) => void;
	} = $props();

	let el: HTMLDivElement;
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
			const c = colorsFor(i.type);
			out.push({
				id: `i:${i.id}`,
				title: i.title,
				start: i.date ?? undefined,
				end: i.endDate ? addDays(i.endDate, 1) : undefined,
				allDay: true,
				editable: i.editable,
				durationEditable: false,
				backgroundColor: c.bg,
				borderColor: c.bg,
				textColor: c.ink,
				classNames: ['lt-chip', typeClass(i.type), ...(i.status === 'done' ? ['is-done'] : [])],
				extendedProps: { kind: 'item', item: i },
			});
		}
		for (const b of blocks) {
			const s = utcToLocal(b.startAt, tz);
			const e = utcToLocal(b.endAt, tz);
			const c = colorsFor(blockType(b));
			out.push({
				id: `b:${b.id}`,
				title: b.label,
				start: `${s.date}T${s.time}:00`,
				end: `${e.date}T${e.time}:00`,
				allDay: false,
				editable: b.editable,
				backgroundColor: c.bg,
				borderColor: c.bg,
				textColor: c.ink,
				classNames: ['lt-blk', ...(b.status === 'done' ? ['is-done'] : [])],
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
			firstDay: 1,
			headerToolbar: false,
			height: 'auto',
			contentHeight: 760,
			expandRows: false,
			allDaySlot: true,
			allDayText: 'all day',
			slotDuration: '00:30:00',
			snapDuration: '00:15:00',
			slotLabelInterval: '01:00',
			slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
			scrollTime: '07:00:00',
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
					wrap.append(square(it.status, c.ink, it.title, () => oncycleitem(it.id)));
					const t = document.createElement('span');
					t.className = 'lt-title';
					t.textContent = (it.time ? `${prettyTime(it.time)} ` : '') + it.title;
					wrap.append(t);
				} else if (p.block) {
					const b = p.block;
					wrap.append(square(b.status, p.ink ?? '#000', b.label, () => oncycleblock(b.id)));
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
				}
				return { domNodes: [wrap] };
			},
			eventClick: (info) => {
				const p = info.event.extendedProps as { kind: string; item?: ItemDTO; block?: BlockDTO };
				info.jsEvent.preventDefault();
				if (p.item) onopen(p.item.id);
				else if (p.block?.itemId) onopen(p.block.itemId);
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
			select: (info) => {
				cal?.unselect();
				if (info.allDay) return;
				const s = parts(info.startStr);
				const e = parts(info.endStr);
				oncreateblock(localToUtc(s.date, s.minutes ?? 0, tz), localToUtc(e.date, e.minutes ?? 0, tz));
			},
			drop: (info) => {
				const id = (info.draggedEl as HTMLElement).dataset.ltItem;
				if (!id) return;
				const p = parts(info.dateStr);
				ondropitem(id, p.date, info.allDay ? null : p.minutes);
			},
		});
		cal.render();
		if (dragSource) {
			drag = new Draggable(dragSource, {
				itemSelector: '[data-lt-item]',
				eventData: (e) => ({
					title: (e as HTMLElement).dataset.title ?? '',
					duration: '01:00',
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
			localToUtc(e.date, e.minutes ?? (s.minutes ?? 0) + 60, tz),
		);
	}

	onDestroy(() => {
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
	void hhmm;
</script>

<div class="wk" bind:this={el}></div>

<style>
	.wk :global(.fc) {
		--fc-border-color: var(--rule);
		--fc-today-bg-color: #fafaf9;
		--fc-now-indicator-color: var(--ink);
		font-size: 12px;
	}
	.wk :global(.fc .fc-day-today) {
		background: #fafaf9 !important;
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
	.wk :global(.lt-blk) {
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
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
		background: #fff;
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.wk :global(.lt-sq.on) {
		background: var(--ink);
		color: #fff;
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
