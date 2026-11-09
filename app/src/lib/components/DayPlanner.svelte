<!-- FR-H9..H13. One day, 00-24, opens at 07:00, 15-min snap, midnight-crossing blocks clipped per day.
     Drag empty = create · drag body = move · drag edge = resize · square cycles · drop item chip = 60-min linked block. -->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import StatusSquare from './StatusSquare.svelte';
	import DraftBlock from './DraftBlock.svelte';
	import RollHandle from './RollHandle.svelte';
	import { page } from '$app/state';
	import { hoursState } from '$lib/client/hours.svelte';
	import { DEFAULT_HOURS, type HourRange } from '$lib/hours';
	import SlotCommand from './SlotCommand.svelte';
	import { layoutDay, type Piece } from '$lib/planner-layout';
	import type { QAParse } from '$lib/quickadd';
	import { post, patch as apiPatch } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { entryColors } from '$lib/client/partner';
	import {
		addDays,
		fixRange,
		hhmm,
		isoPlus,
		localToUtc,
		nowLocalMinutes,
		prettyDate,
		snap15,
		todayLocal,
		weekdayOf,
	} from '$lib/time';
	import type { BlockDTO } from '$lib/types';
	import { without } from '$lib/client/obj';
	import { removeBlock } from '$lib/client/remove';

	let {
		date,
		tz,
		blocks,
		onnav,
		onchanged,
		oncycle,
		onopenitem,
		top,
		linkItemId,
		focusItemId,
		tip = true,
		height,
	}: {
		date: string;
		tz: string;
		blocks: BlockDTO[];
		onnav: (date: string) => void;
		onchanged: () => void;
		oncycle: (id: string) => void;
		onopenitem: (itemId: string) => void;
		top?: Snippet;
		/** item view: new drag-created blocks link to this item (label = item title, no prompt) */
		linkItemId?: string;
		/** item view: this item's blocks full colour, everything else muted */
		focusItemId?: string;
		tip?: boolean;
		/** scroll area height override (px) */
		height?: number;
	} = $props();

	const HOUR = 48;
	const PX_MIN = HOUR / 60;
	const DAY_MIN = 1440;
	const DAYNAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	let scroller: HTMLDivElement;
	let gridEl: HTMLDivElement;
	let nowMin = $state(-1);

	// optimistic overrides while dragging / saving: id -> {startAt,endAt}
	let over = $state<Record<string, { startAt: string; endAt: string }>>({});
	let draft = $state<{ start: number; end: number; naming: boolean; label: string } | null>(null);
	let menuFor = $state<string | null>(null);
	let menuLabel = $state('');

	// typed day/time in the drag box moves the box live (same day only)
	let draftParse = $state<QAParse | null>(null);
	const draftView = $derived.by(() => {
		if (!draft) return null;
		const p = draftParse;
		if (!draft.naming || !p || p.date !== date || p.startMinutes === null)
			return {
				start: draft.start,
				end: draft.end,
				type: p?.typeSet ? p.type : null,
				thin: false,
				ce: false,
				note: p && p.date !== date ? 'other day' : '',
			};
		const thin = p.target === 'calendar';
		const e = thin ? p.startMinutes + 30 : (p.endMinutes ?? p.startMinutes + 60);
		return {
			start: p.startMinutes,
			end: Math.min(e, DAY_MIN),
			type: p.typeSet ? p.type : null,
			thin,
			ce: e > DAY_MIN,
			note: thin ? 'calendar item' : '',
		};
	});

	const pieces = $derived(layoutDay(blocks, date, tz, over));

	// ---------- visible hours (rolled hours hidden, grid top-justified) ----------
	const hr = $derived<HourRange>(
		hoursState.ready ? hoursState : ((page.data.hours as HourRange | undefined) ?? DEFAULT_HOURS),
	);
	// while naming a draft, widen the view so a typed time outside the range is still visible
	const S = $derived(
		Math.min(hr.start * 60, draft?.naming && draftView ? Math.floor(draftView.start / 60) * 60 : 1440),
	);
	const E = $derived(
		Math.max(hr.end * 60, draft?.naming && draftView ? Math.ceil(draftView.end / 60) * 60 : 0),
	);
	const hourList = $derived(Array.from({ length: (E - S) / 60 }, (_, i) => S / 60 + i));
	const vis = $derived(
		pieces
			.map((p) => ({
				...p,
				vt: Math.max(p.top, S),
				vb: Math.min(p.bottom, E),
				cutTop: p.top < S,
				cutBot: p.bottom > E,
			}))
			.filter((p) => p.vb > p.vt),
	);
	const hiddenTop = $derived(pieces.filter((p) => p.bottom <= S).map((p) => p.b.label));
	const hiddenBot = $derived(pieces.filter((p) => p.top >= E).map((p) => p.b.label));

	const isToday = $derived(date === todayLocal(tz));

	onMount(() => {
		const tick = () => (nowMin = nowLocalMinutes(tz));
		tick();
		const t = setInterval(tick, 60_000);
		return () => clearInterval(t);
	});

	function yToMin(clientY: number): number {
		const r = gridEl.getBoundingClientRect();
		return Math.max(S, Math.min(E, S + (clientY - r.top) / PX_MIN));
	}

	/** for drops from outside (month calendar). null = not over grid */
	export function timeAt(x: number, y: number): number | null {
		const r = scroller.getBoundingClientRect();
		if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
		return Math.max(S, Math.min(E - 60, snap15(yToMin(y))));
	}

	export async function createLinked(itemId: string, startMin: number) {
		const s = localToUtc(date, startMin, tz);
		try {
			await post('/api/blocks', { itemId, startAt: s, endAt: isoPlus(s, 60 * 60_000) });
			showToast(`Blocked ${hhmm(startMin)}–${hhmm(startMin + 60)}`);
			onchanged();
		} catch (e) {
			showError(e);
		}
	}

	// ---------- pointer: create ----------
	let gesture: {
		kind: 'create' | 'move' | 'top' | 'bottom';
		id?: string;
		startY: number;
		origStart?: string;
		origEnd?: string;
		origTop?: number;
		origBottom?: number;
		anchor?: number;
		moved: boolean;
	} | null = null;

	function onGridDown(e: PointerEvent) {
		if (e.button !== 0 || (e.target as HTMLElement).closest('.blk, .draft, .menu, .bx, .lt-slotcmd')) return;
		menuFor = null;
		const m = snap15(yToMin(e.clientY));
		gesture = { kind: 'create', startY: e.clientY, anchor: m, moved: false };
		draft = { start: m, end: m + 15, naming: false, label: '' };
		gridEl.setPointerCapture(e.pointerId);
	}

	function onBlockDown(e: PointerEvent, p: Piece, kind: 'move' | 'top' | 'bottom') {
		if (e.button !== 0 || !p.b.editable) return;
		e.stopPropagation();
		gesture = {
			kind,
			id: p.b.id,
			startY: e.clientY,
			origStart: p.b.startAt,
			origEnd: p.b.endAt,
			origTop: p.top,
			origBottom: p.bottom,
			moved: false,
		};
		gridEl.setPointerCapture(e.pointerId);
	}

	function onMove(e: PointerEvent) {
		if (!gesture) return;
		if (Math.abs(e.clientY - gesture.startY) > 4) gesture.moved = true;
		if (!gesture.moved) return;
		const m = yToMin(e.clientY);
		if (gesture.kind === 'create' && draft && gesture.anchor !== undefined) {
			const [s, en] = fixRange(Math.min(gesture.anchor, m), Math.max(gesture.anchor, m));
			draft = { ...draft, start: s, end: Math.min(en, E) };
			return;
		}
		const g = gesture;
		if (!g.id || !g.origStart || !g.origEnd || g.origTop === undefined || g.origBottom === undefined) return;
		const deltaRaw = (e.clientY - g.startY) / PX_MIN;
		if (g.kind === 'move') {
			const newTop = snap15(g.origTop + deltaRaw);
			const d = newTop - g.origTop;
			over[g.id] = { startAt: isoPlus(g.origStart, d * 60_000), endAt: isoPlus(g.origEnd, d * 60_000) };
		} else if (g.kind === 'top') {
			const newTop = Math.min(snap15(g.origTop + deltaRaw), g.origBottom - 15);
			over[g.id] = { startAt: localToUtc(date, Math.max(0, newTop), tz), endAt: g.origEnd };
		} else {
			const newBot = Math.max(snap15(g.origBottom + deltaRaw), g.origTop + 15);
			over[g.id] = { startAt: g.origStart, endAt: localToUtc(date, Math.min(DAY_MIN, newBot), tz) };
		}
	}

	async function onUp() {
		const g = gesture;
		gesture = null;
		if (!g) return;
		if (g.kind === 'create') {
			if (!draft) return;
			if (!g.moved) {
				draft = null;
				return;
			}
			if (linkItemId) {
				const d = draft;
				draft = null;
				try {
					await post('/api/blocks', {
						itemId: linkItemId,
						startAt: localToUtc(date, d.start, tz),
						endAt: localToUtc(date, d.end, tz),
					});
					onchanged();
				} catch (e) {
					showError(e);
				}
				return;
			}
			draftParse = null;
			draft = { ...draft, naming: true };
			return;
		}
		if (!g.id) return;
		if (!g.moved) {
			const b = blocks.find((x) => x.id === g.id);
			menuFor = g.id;
			menuLabel = b?.label ?? '';
			return;
		}
		const o = over[g.id];
		if (!o) return;
		try {
			await apiPatch(`/api/blocks/${g.id}`, { startAt: o.startAt, endAt: o.endAt });
			onchanged();
		} catch (e) {
			showError(e);
		} finally {
			// keep override until refetch lands (avoids flicker)
			setTimeout(() => {
				if (g.id) over = without(over, g.id);
			}, 400);
		}
	}

	async function renameBlock(id: string) {
		const l = menuLabel.trim();
		menuFor = null;
		if (!l) return;
		try {
			await apiPatch(`/api/blocks/${id}`, { label: l });
			onchanged();
		} catch (e) {
			showError(e);
		}
	}

	async function deleteBlock(id: string) {
		menuFor = null;
		const b = blocks.find((x) => x.id === id);
		await removeBlock(id, b?.label ?? 'block', onchanged);
	}

	// ---------- keyboard (focus block: arrows move 15, shift+arrows resize) ----------
	async function onBlockKey(e: KeyboardEvent, p: Piece) {
		if (!p.b.editable || e.target !== e.currentTarget) return; // keys typed in the menu/rename stay there
		if (e.key === 'Enter') {
			menuFor = p.b.id;
			menuLabel = p.b.label;
			e.preventDefault();
			return;
		}
		if (e.key === 'Delete') {
			e.preventDefault();
			return deleteBlock(p.b.id);
		}
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		const d = (e.key === 'ArrowUp' ? -15 : 15) * 60_000;
		const cur = over[p.b.id] ?? { startAt: p.b.startAt, endAt: p.b.endAt }; // repeat presses stack
		const id = p.b.id;
		let body: { startAt?: string; endAt: string };
		if (e.shiftKey) {
			const endAt = isoPlus(cur.endAt, d);
			if (Date.parse(endAt) - Date.parse(cur.startAt) < 15 * 60_000) return; // min 15 min
			body = { endAt };
		} else body = { startAt: isoPlus(cur.startAt, d), endAt: isoPlus(cur.endAt, d) };
		const mine = { startAt: body.startAt ?? cur.startAt, endAt: body.endAt };
		over[id] = mine;
		try {
			await apiPatch(`/api/blocks/${id}`, body);
			onchanged();
			setTimeout(() => {
				if (over[id] === mine) over = without(over, id);
			}, 400);
		} catch (err) {
			over = without(over, id);
			showError(err);
		}
	}

	// ---------- HTML5 drop from due chips / unscheduled ----------
	function onDragOver(e: DragEvent) {
		if (e.dataTransfer?.types.includes('application/x-lt-item')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		}
	}
	async function onDrop(e: DragEvent) {
		const id = e.dataTransfer?.getData('application/x-lt-item');
		if (!id) return;
		e.preventDefault();
		await createLinked(id, Math.max(S, Math.min(E - 60, snap15(yToMin(e.clientY)))));
	}

	const fmt = (p: Piece) => {
		const s = p.clippedStart ? '…' : hhmm(p.top);
		const en = p.clippedEnd ? '…' : hhmm(p.bottom);
		return `${s} – ${en}`;
	};
</script>

<div class="card planner">
	<div class="head strip">
		<div class="dt">
			<span class="muted">{DAYNAMES[weekdayOf(date) - 1]}</span>
			<h2>{prettyDate(date).split(' ').slice(1, 3).join(' ')}</h2>
		</div>
		<div class="nav">
			<button class="btn sm" type="button" onclick={() => onnav(todayLocal(tz))} disabled={isToday}
				>Today</button
			>
			<button class="round" type="button" aria-label="Previous day" onclick={() => onnav(addDays(date, -1))}>
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
			<button class="round" type="button" aria-label="Next day" onclick={() => onnav(addDays(date, 1))}>
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
		</div>
	</div>
	{@render top?.()}
	<div
		class="scroll"
		bind:this={scroller}
		role="region"
		aria-label="Planner for {prettyDate(date)}"
		style:height={height ? `${height}px` : undefined}
	>
		<RollHandle edge="top" hourPx={HOUR} hidden={hiddenTop} />
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="grid"
			bind:this={gridEl}
			style:height="{(E - S) * PX_MIN}px"
			onpointerdown={onGridDown}
			onpointermove={onMove}
			onpointerup={onUp}
			onpointercancel={onUp}
			ondragover={onDragOver}
			ondrop={onDrop}
		>
			{#each hourList as h (h)}
				<div class="hr" style:top="{(h * 60 - S) * PX_MIN}px">
					<span>{String(h).padStart(2, '0')}:00</span>
				</div>
			{/each}

			{#if isToday && nowMin >= S && nowMin <= E}
				<div class="now" style:top="{(nowMin - S) * PX_MIN}px" aria-hidden="true"><span></span><i></i></div>
			{/if}

			{#each vis as p (p.b.id)}
				{@const c = entryColors(p.b)}
				{#if p.b.theirs && p.b.owner}
					<!-- shared, read-only -->
					<div
						class="blk theirs lt-theirs"
						class:lt-busy={p.b.busy}
						class:cs={p.clippedStart || p.cutTop}
						class:ce={p.clippedEnd || p.cutBot}
						style:top="{(p.vt - S) * PX_MIN}px"
						style:height="{Math.max(18, (p.vb - p.vt) * PX_MIN)}px"
						style:left="calc(56px + (100% - 70px) * {p.col / p.cols})"
						style:width="calc((100% - 70px) / {p.cols} - 4px)"
						style:background-color={c.bg}
						style:color={c.ink}
						style:--line={c.line}
						title="{p.b.owner.name}'s calendar (view only)"
					>
						<span class="lt-who" style:background={p.b.owner.color} aria-hidden="true"
							>{p.b.owner.initial}</span
						>
						<div class="txt">
							<span class="lbl"><span class="sr-only">{p.b.owner.name}: </span>{p.b.label}</span>
							{#if (p.vb - p.vt) * PX_MIN >= 34}<span class="tm">{fmt(p)}</span>{/if}
						</div>
					</div>
				{:else}
					<div
						class="blk"
						class:done={p.b.status === 'done'}
						class:cs={p.clippedStart || p.cutTop}
						class:ce={p.clippedEnd || p.cutBot}
						class:lift={!!over[p.b.id]}
						class:muted={!!focusItemId && p.b.itemId !== focusItemId}
						style:top="{(p.vt - S) * PX_MIN}px"
						style:height="{Math.max(18, (p.vb - p.vt) * PX_MIN)}px"
						style:left="calc(56px + (100% - 70px) * {p.col / p.cols})"
						style:width="calc((100% - 70px) / {p.cols} - 4px)"
						style:background={c.bg}
						style:color={c.ink}
						style:--sq-on={c.bg}
						style:--line={c.line}
						role="button"
						tabindex="0"
						aria-label="{p.b.label}, {fmt(p)}. Arrows move 15 min, Shift+arrows resize, Enter edit"
						onpointerdown={(e) => onBlockDown(e, p, 'move')}
						onkeydown={(e) => onBlockKey(e, p)}
					>
						{#if !p.clippedStart && !p.cutTop && p.b.editable}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="h top" onpointerdown={(e) => onBlockDown(e, p, 'top')}></div>
						{/if}
						<StatusSquare status={p.b.status} size={20} ink={c.ink} oncycle={() => oncycle(p.b.id)} />
						<div class="txt">
							<span class="lbl">{p.b.label}</span>
							{#if (p.vb - p.vt) * PX_MIN >= 34}<span class="tm">{fmt(p)}</span>{/if}
						</div>
						{#if !p.clippedEnd && !p.cutBot && p.b.editable}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="h bot" onpointerdown={(e) => onBlockDown(e, p, 'bottom')}></div>
						{/if}
						{#if p.b.editable}
							<button
								class="bx"
								type="button"
								aria-label="Delete {p.b.label}"
								title="Delete"
								onpointerdown={(e) => e.stopPropagation()}
								onclick={(e) => {
									e.stopPropagation();
									deleteBlock(p.b.id);
								}}
								><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
									><circle
										cx="8"
										cy="8"
										r="7"
										fill="var(--card)"
										stroke="currentColor"
										stroke-width="1.4"
									/><path
										d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
									/></svg
								></button
							>
						{/if}
					</div>
					{#if menuFor === p.b.id}
						<div class="menu" style:top="{(p.vb - S) * PX_MIN + 4}px">
							<label class="sr-only" for="bl-{p.b.id}">Block label</label>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								id="bl-{p.b.id}"
								class="input sm"
								bind:value={menuLabel}
								autofocus
								onkeydown={(e) => {
									if (e.key === 'Enter') renameBlock(p.b.id);
									if (e.key === 'Escape') menuFor = null;
								}}
							/>
							<div class="row">
								<button class="btn sm primary" type="button" onclick={() => renameBlock(p.b.id)}>Save</button>
								{#if p.b.itemId}
									<button class="btn sm" type="button" onclick={() => p.b.itemId && onopenitem(p.b.itemId)}
										>Open item</button
									>
								{/if}
								<button class="btn sm danger" type="button" onclick={() => deleteBlock(p.b.id)}>Delete</button
								>
								<button class="btn sm ghost" type="button" onclick={() => (menuFor = null)}>Close</button>
							</div>
						</div>
					{/if}
				{/if}
			{/each}

			{#if draft && draftView}
				<DraftBlock
					start={draftView.start}
					end={draftView.end}
					pxMin={PX_MIN}
					offset={S}
					type={draftView.type}
					thin={draftView.thin}
					clippedEnd={draftView.ce}
					note={draftView.note}
					animate={draft.naming}
				>
					{#if draft.naming}
						<SlotCommand
							{date}
							start={draft.start}
							end={draft.end}
							onparsed={(p) => (draftParse = p)}
							ondone={() => {
								draft = null;
								onchanged();
							}}
							oncancel={() => (draft = null)}
						/>
					{/if}
				</DraftBlock>
			{/if}
		</div>
		<RollHandle edge="bottom" hourPx={HOUR} hidden={hiddenBot} />
	</div>
	{#if tip}
		<div class="tip">
			Drag on empty time, then type a title (/type, /calendar work too) · drag edges to resize · drag due
			chips or month items here
		</div>
	{/if}
</div>

<style>
	.planner {
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--rule);
		background: var(--strip-b);
		padding: 12px 16px;
	}
	.dt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
	}
	h2 {
		font-size: 18px;
		font-weight: 700;
	}
	.nav {
		display: flex;
		gap: 6px;
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
	/* height follows the visible hours; rolled hours shrink it, content stays top-justified */
	.scroll {
		max-height: calc(100vh - 220px);
		overflow-y: auto;
		position: relative;
	}
	.grid {
		position: relative;
		user-select: none;
		touch-action: none;
		cursor: crosshair;
	}
	.hr {
		position: absolute;
		left: 0;
		right: 0;
		height: 48px;
		border-top: 1px solid var(--rule);
		pointer-events: none;
	}
	.hr span {
		display: block;
		width: 56px;
		padding: 4px 0 0 14px;
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
		pointer-events: none;
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
		border-radius: 8px;
		padding: 5px 24px 5px 8px;
		display: flex;
		gap: 8px;
		align-items: flex-start;
		overflow: hidden;
		cursor: grab;
		z-index: 3;
		border: 1px solid var(--line, transparent);
	}
	.blk.theirs {
		padding-right: 8px;
		align-items: center;
	}
	.blk.theirs .lt-who {
		align-self: flex-start;
		margin-top: 2px;
	}
	.blk.cs {
		border-top: 2px dashed currentColor;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.blk.ce {
		border-bottom: 2px dashed currentColor;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
	.blk.lift {
		box-shadow: 0 6px 16px rgb(0 0 0 / 0.18);
		z-index: 5;
	}
	.blk.muted {
		background: var(--rule) !important;
		color: var(--quiet) !important;
		border-style: dashed;
		z-index: 2;
	}
	.bx {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 18px;
		height: 18px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		z-index: 4;
		transition: opacity 0.12s;
	}
	.blk:hover .bx,
	.blk:focus-within .bx,
	.bx:focus-visible {
		opacity: 1;
	}
	.bx:hover svg circle {
		fill: currentColor;
	}
	.bx:hover svg path {
		stroke: var(--card);
	}
	.blk.done .lbl {
		text-decoration: line-through;
	}
	.txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.lbl {
		font-size: 13px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tm {
		font-size: 11px;
		white-space: nowrap;
	}
	.h {
		position: absolute;
		left: 0;
		right: 0;
		height: 6px;
		cursor: ns-resize;
		z-index: 2;
	}
	.h.top {
		top: 0;
	}
	.h.bot {
		bottom: 0;
	}
	.menu {
		position: absolute;
		left: 56px;
		right: 14px;
		z-index: 9;
		background: var(--card);
		border-radius: 10px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		cursor: default;
		border: 1.5px solid var(--card-edge);
		box-shadow: var(--shadow-card);
	}
	.row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tip {
		padding: 8px 16px;
		font-size: 11px;
		color: var(--quiet);
		border-top: 1px solid var(--rule);
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

	.menu {
		animation: lt-pop 160ms var(--ease) both;
		transform-origin: top center;
	}

	.blk {
		transition: box-shadow var(--t-fast) var(--ease);
	}
	.blk:not(.muted):not(.lift):hover {
		box-shadow: -3px 3px 0 var(--accent);
	}
	.now span {
		animation: lt-ping 2.4s ease-out infinite;
	}
</style>
