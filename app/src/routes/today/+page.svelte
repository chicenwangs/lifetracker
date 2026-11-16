<!-- Phone Today (FEATURES §10, MOB-001..006): date header with day step + swipe, Now card, timeline top-aligned on
     now (owner 2026-11-14). Hold a row ~0.5 s = delete with Undo. No "To do today" list (owner 2026-11-16).
     Glance + capture; planning stays on the PC. Works on desktop too. -->
<script lang="ts">
	import { buzz } from '$lib/client/haptics';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { invalidateAll } from '$lib/client/refresh';
	import { onMount, tick } from 'svelte';
	import { post } from '$lib/client/api';
	import { calendarBus } from '$lib/client/bus.svelte';
	import { shown } from '$lib/client/itemtypes.svelte';
	import { openItem } from '$lib/client/peek.svelte';
	import { entryColors } from '$lib/client/partner';
	import { showError } from '$lib/client/toast.svelte';
	import { without } from '$lib/client/obj';
	import { openAdd } from '$lib/client/mobile.svelte';
	import { colorsFor } from '$lib/colors';
	import StatusSquare from '$lib/components/StatusSquare.svelte';
	import { addDays, clock, nowLocalMinutes, prettyDate, utcToLocal } from '$lib/time';
	import { removeBlock, removeItem } from '$lib/client/remove';
	import type { BlockDTO, ItemDTO, Status } from '$lib/types';

	let { data } = $props();
	const tz = $derived(data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const h12 = $derived(data.user?.region === 'us');
	let now = $state(Date.now());
	// Android widget "+" opens /today?add
	afterNavigate(() => {
		if (!new URLSearchParams(location.search).has('add')) return;
		// router not ready yet on first load; drop ?add first so the sheet's own Back entry sits on a clean /today
		setTimeout(() => {
			replaceState(location.pathname, {});
			openAdd('');
		});
	});
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});
	const isToday = $derived(data.day === data.today);
	const nowMin = $derived(nowLocalMinutes(tz, now));

	interface Entry {
		key: string;
		start: number; // minutes from the day's 00:00 (can be < 0 / > 1440 for overnight pieces)
		end: number;
		label: string;
		block?: BlockDTO;
		item?: ItemDTO;
	}
	const mins = (iso: string) => {
		const l = utcToLocal(iso, tz);
		return l.minutes + (l.date < data.day ? -1440 : l.date > data.day ? 1440 : 0);
	};
	const entries = $derived<Entry[]>(
		[
			...shown(data.cal.blocks).map((b: BlockDTO) => ({ key: b.id, start: mins(b.startAt), end: mins(b.endAt), label: b.label, block: b })),
			...shown(data.cal.items)
				.filter((i: ItemDTO) => i.time && i.date === data.day)
				.map((i: ItemDTO) => {
					const s = Number(i.time?.slice(0, 2)) * 60 + Number(i.time?.slice(3, 5));
					return { key: i.id, start: s, end: s + 60, label: i.title, item: i }; // timed items count as 60 min (plan-ahead rule)
				}),
		]
			.filter((e) => e.end > 0 && e.start < 1440)
			.sort((a, b) => a.start - b.start),
	); // prettier-ignore

	// ---------- Now card ----------
	const current = $derived(isToday ? entries.find((e) => e.start <= nowMin && nowMin < e.end) : undefined);
	const next = $derived(isToday ? entries.find((e) => e.start > nowMin) : undefined);
	const fmt = (m: number) => clock(((m % 1440) + 1440) % 1440, h12);
	const left = (m: number) =>
		m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}` : `${m} min`;

	// ---------- status (optimistic) ----------
	let over = $state<Record<string, Status>>({});
	async function cycle(kind: 'items' | 'blocks', id: string, cur: Status) {
		over[id] = cur === 'todo' ? 'doing' : cur === 'doing' ? 'done' : 'todo';
		try {
			await post(`/api/${kind}/${id}/cycle`);
			await invalidateAll();
		} catch (e) {
			showError(e);
		} finally {
			over = without(over, id);
		}
	}

	// ---------- hold to delete (phone, owner 2026-11-16) ----------
	// ~0.5 s press on a row = delete with the usual Undo toast. Moving the finger (scroll) cancels.
	let hold: { t: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
	let held = false; // swallow the tap that ends a hold
	function press(e: PointerEvent, en: Entry) {
		const row = en.block ?? en.item;
		if (!row || row.theirs || !row.editable) return;
		held = false;
		hold = {
			x: e.clientX,
			y: e.clientY,
			t: setTimeout(() => {
				hold = null;
				held = true;
				buzz('pickup');
				const done = () => invalidateAll();
				if (en.item) void removeItem(en.item.id, en.label, done);
				else if (en.block) void removeBlock(en.block.id, en.label, done);
			}, 500),
		};
	}
	function unpress(e?: PointerEvent) {
		if (!hold) return;
		if (e && e.type === 'pointermove' && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) < 10) return;
		clearTimeout(hold.t);
		hold = null;
	}

	// ---------- wheel ----------
	let wheel: HTMLDivElement | undefined = $state();
	/** how far the "now" row sits below the top of the wheel (px) */
	const nowOffset = (w: HTMLElement, el: HTMLElement) =>
		el.getBoundingClientRect().top - w.getBoundingClientRect().top;
	// top-aligned: the "now" row (or the first row) starts at the very top, earlier rows scroll up
	function toNow(smooth = true) {
		const el = wheel?.querySelector<HTMLElement>('[data-now]');
		if (!wheel || !el) return;
		wheel.scrollTo({ top: wheel.scrollTop + nowOffset(wheel, el), behavior: smooth ? 'smooth' : 'instant' });
	}
	$effect(() => {
		void entries;
		void tick().then(() => toNow(false));
	});
	/** row nearest "now" (or the first upcoming); on other days the first row */
	const nowKey = $derived(isToday ? (current ?? next ?? entries.at(-1))?.key : entries[0]?.key);

	// ---------- week strip + day swipe (#94, G3 / G7) ----------
	const go = (d: string) => goto(`/today?d=${d}`, { keepFocus: true, noScroll: true });
	const step = (n: number) => go(addDays(data.day, n));
	const strip = $derived(Array.from({ length: 7 }, (_, i) => addDays(data.week.from, i)));
	const busy = $derived(new Set(data.week.busy));
	let picker: HTMLInputElement | undefined = $state();
	const pick = () => (picker?.showPicker ? picker.showPicker() : picker?.click());
	// the day follows the finger; the neighbour's date peeks in; past a quarter of the width it steps
	let dx = $state(0);
	let axis = $state<'x' | 'y' | null>(null);
	let sx = 0;
	let sy = 0;
	function tstart(e: TouchEvent) {
		const t = e.touches[0];
		if (!t || e.touches.length > 1) return;
		sx = t.clientX;
		sy = t.clientY;
		axis = null;
	}
	function tmove(e: TouchEvent) {
		const t = e.touches[0];
		if (!t) return;
		const x = t.clientX - sx;
		const y = t.clientY - sy;
		if (!axis && Math.hypot(x, y) > 10) axis = Math.abs(x) > 1.5 * Math.abs(y) ? 'x' : 'y';
		if (axis === 'x') dx = x;
	}
	function tend() {
		if (axis === 'x' && Math.abs(dx) > innerWidth / 4) {
			const n = dx < 0 ? 1 : -1;
			dx = -n * innerWidth; // finish the slide, then show the new day in place
			setTimeout(() => void step(n).then(() => (dx = 0)), 160);
		} else dx = 0;
		axis = null;
	}
	// swipe the strip = the week before / after (tap path: the date picker on the title)
	let wx = 0;
	const wstart = (e: TouchEvent) => (wx = e.touches[0]?.clientX ?? 0);
	function wend(e: TouchEvent) {
		const x = (e.changedTouches[0]?.clientX ?? wx) - wx;
		if (Math.abs(x) > 50) void go(addDays(data.day, x < 0 ? 7 : -7));
	}
	$effect(() => {
		void calendarBus.version;
		if (calendarBus.version) void invalidateAll();
	});
</script>

<svelte:head><title>Today · Life Tracker</title></svelte:head>

<main class="today">
	<header class="day">
		<!-- date line over the title; tap it for any day (#94) -->
		<h1>
			<button class="pickday" type="button" aria-label="{prettyDate(data.day)}. Pick a day" onclick={pick}>
				<span class="sub">{prettyDate(data.day)} ▾</span>{isToday
					? 'Today'
					: prettyDate(data.day).split(' ').slice(0, 3).join(' ')}
			</button>
		</h1>
		<input
			class="sr-only"
			type="date"
			tabindex="-1"
			aria-hidden="true"
			bind:this={picker}
			value={data.day}
			onchange={(e) => e.currentTarget.value && go(e.currentTarget.value)}
		/>
		{#if !isToday}<a class="btn sm" href="/today">Today</a>{/if}
	</header>
	<nav class="strip" aria-label="This week" ontouchstart={wstart} ontouchend={wend}>
		{#each strip as d (d)}
			<button
				type="button"
				class:on={d === data.day}
				class:istoday={d === data.today}
				aria-current={d === data.day ? 'date' : undefined}
				aria-label="{prettyDate(d)}{busy.has(d) ? ', has plans' : ''}"
				onclick={() => go(d)}
			>
				<span class="wd">{prettyDate(d).split(' ')[0]}</span>
				<b>{Number(d.slice(8))}</b>
				<i class:dot={busy.has(d)} aria-hidden="true"></i>
			</button>
		{/each}
	</nav>
	<div
		class="swipe"
		role="group"
		aria-label="The day. Swipe sideways for the day before or after"
		class:dragging={axis === 'x'}
		style:translate={dx ? `${dx}px 0` : null}
		ontouchstart={tstart}
		ontouchmove={tmove}
		ontouchend={tend}
		ontouchcancel={tend}
	>
		{#if dx}
			<div class="peek" class:prev={dx > 0} aria-hidden="true">
				{prettyDate(addDays(data.day, dx > 0 ? -1 : 1))}
			</div>
		{/if}

		{#if isToday}
			<section class="now card" aria-label="Now">
				{#if current}
					{@const c = current.block ? entryColors(current.block) : colorsFor(current.item?.type)}
					<span class="k">Now</span>
					<div class="cur" style:--bg={c.bg} style:--fg={c.ink}>
						<b>{current.label}</b>
						<span>{fmt(current.start)} – {fmt(current.end)} · {left(current.end - nowMin)} left</span>
					</div>
				{:else}
					<span class="k">Now</span>
					<b>{next ? `Free until ${fmt(next.start)}` : 'Free for the rest of the day'}</b>
				{/if}
				{#if next && current}<span class="hint">Next: {next.label} at {fmt(next.start)}</span>{/if}
			</section>
		{/if}

		<section class="card tl" aria-label="Timeline">
			{#if entries.length}
				<div class="wheel" bind:this={wheel}>
					{#each entries as e (e.key)}
						{@const c = e.block ? entryColors(e.block) : colorsFor(e.item?.type)}
						{@const past = isToday && e.end <= nowMin}
						<div
							class="ent"
							class:past
							class:live={current?.key === e.key}
							class:theirs={(e.block ?? e.item)?.theirs}
							data-now={e.key === nowKey ? '' : undefined}
							style:--bg={c.bg}
							style:--fg={c.ink}
							style:--sq-on={c.bg}
							role="group"
							aria-label="{e.label}, hold to delete"
							onpointerdown={(ev) => press(ev, e)}
							onpointermove={unpress}
							onpointerup={() => unpress()}
							onpointercancel={() => unpress()}
							oncontextmenu={(ev) => (e.block ?? e.item)?.editable && ev.preventDefault()}
							onclickcapture={(ev) => held && (ev.stopPropagation(), ev.preventDefault(), (held = false))}
						>
							<span class="tm">{fmt(e.start)}<br /><span class="hint">{fmt(e.end)}</span></span>
							<div class="box">
								{#if (e.block ?? e.item)?.theirs}
									<span class="who" style:background={(e.block ?? e.item)?.owner?.color}
										>{(e.block ?? e.item)?.owner?.initial}</span
									>
								{:else if e.block}
									<StatusSquare
										status={over[e.key] ?? e.block.status}
										size={20}
										oncycle={() => e.block && cycle('blocks', e.key, over[e.key] ?? e.block.status)}
									/>
								{:else if e.item}
									<StatusSquare
										status={over[e.key] ?? e.item.status}
										size={20}
										oncycle={() => e.item && cycle('items', e.key, over[e.key] ?? e.item.status)}
									/>
								{/if}
								<button
									class="t"
									type="button"
									disabled={!!(e.block ?? e.item)?.theirs || (!!e.block && !e.block.itemId)}
									onclick={() => (e.item ? openItem(e.item.id) : e.block?.itemId && openItem(e.block.itemId))}
									>{e.label}</button
								>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="empty">
					<p>Nothing planned.</p>
					<button class="btn primary" type="button" onclick={() => openAdd('')}>+ Add something</button>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
	.today {
		overflow-x: clip; /* the sliding day never makes the page scroll sideways */
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 12px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.day {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.day h1 {
		flex: 1;
		margin: 0;
		font-size: 28px;
		display: flex;
		flex-direction: column;
	}
	.pickday {
		all: unset;
		display: flex;
		flex-direction: column;
		cursor: pointer;
		min-height: 48px;
		border-radius: 10px;
	}
	.pickday:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	/* week strip (#94): tap a day, swipe for the next week */
	.strip {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
		touch-action: pan-y;
	}
	.strip button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-height: 56px;
		padding: 4px 0;
		border: 1.5px solid transparent;
		border-radius: 14px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.strip .wd {
		font-size: 12px;
		color: var(--quiet);
	}
	.strip b {
		font-size: 16px;
	}
	.strip i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
	}
	.strip i.dot {
		background: currentColor;
	}
	.strip .istoday {
		border-color: var(--border);
	}
	.strip .on {
		background: var(--pill-card);
		color: var(--pill-ink);
	}
	.strip .on .wd {
		color: inherit;
	}
	/* the day under the finger (#94, G3): follows it, the neighbour's date peeks in from the side */
	.swipe {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: inherit;
		touch-action: pan-y;
		transition: translate 160ms var(--ease);
	}
	.swipe.dragging {
		transition: none;
	}
	.peek {
		position: absolute;
		top: 24px;
		left: calc(100% + 24px);
		white-space: nowrap;
		font-weight: 700;
		color: var(--quiet);
	}
	.peek.prev {
		left: auto;
		right: calc(100% + 24px);
	}
	.sub {
		font-size: 13px;
		font-weight: 600;
		color: var(--quiet);
	}
	.now,
	.tl {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.k {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--muted);
	}
	.cur {
		background: var(--bg);
		color: var(--fg);
		border-radius: 10px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.t {
		min-height: 48px;
		flex: 1;
		text-align: left;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		padding: 0;
	}
	.t:disabled {
		cursor: default;
	}
	.tl {
		position: relative;
	}
	.wheel {
		height: min(52vh, 420px);
		overflow-y: auto;
		scroll-snap-type: y proximity;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 0 8px;
	}
	.ent {
		user-select: none; /* long-press deletes; no text selection or callout */
		-webkit-touch-callout: none;
		scroll-snap-align: start;
		display: flex;
		gap: 10px;
		padding: 4px 6px;
		border-radius: 14px;
		transition: background-color var(--t) var(--ease);
	}
	/* past: grey the colour, keep the text contrast (opacity failed axe on titles and times) */
	.ent.past .box {
		filter: grayscale(0.8);
	}
	/* now: the whole row gets a band (owner 2026-11-14: the outline was too faint) */
	.ent.live {
		background: var(--now-band);
	}
	.ent.live .tm {
		color: var(--ink);
		font-weight: 700;
	}
	.tm {
		width: 56px;
		flex: none;
		font-size: 12px;
		text-align: right;
	}
	.box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--bg);
		color: var(--fg);
		border-radius: 10px;
		padding: 8px 10px;
		min-height: 44px;
	}
	.ent.theirs .box {
		background: repeating-linear-gradient(135deg, var(--bg) 0 8px, transparent 8px 14px);
		border: 1.5px dashed var(--fg);
	}
	.who {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		color: #fff;
		font-size: 11px;
		display: grid;
		place-items: center;
	}
	.empty {
		text-align: center;
		padding: 24px 0;
	}
</style>
