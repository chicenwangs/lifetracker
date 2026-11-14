<!-- Phone Today (FEATURES §10, MOB-001..006): date header with day step + swipe, Now card, "No time set today",
     timeline top-aligned on now (owner 2026-11-14). Glance + capture; planning stays on the PC. Works on desktop too. -->
<script lang="ts">
	import { afterNavigate, goto, invalidateAll, replaceState } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { post } from '$lib/client/api';
	import { calendarBus } from '$lib/client/bus.svelte';
	import { shown, typeOf } from '$lib/client/itemtypes.svelte';
	import { openItem } from '$lib/client/peek.svelte';
	import { entryColors } from '$lib/client/partner';
	import { showError } from '$lib/client/toast.svelte';
	import { without } from '$lib/client/obj';
	import { openAdd } from '$lib/client/mobile.svelte';
	import { colorsFor } from '$lib/colors';
	import StatusSquare from '$lib/components/StatusSquare.svelte';
	import { addDays, clock, examCountdown, nowLocalMinutes, prettyDate, utcToLocal } from '$lib/time';
	import type { BlockDTO, ItemDTO, Status } from '$lib/types';

	let { data } = $props();
	const tz = $derived(data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const h12 = $derived(data.user?.region === 'us');
	let now = $state(Date.now());
	// Android widget "+" opens /today?add
	afterNavigate(() => {
		if (!new URLSearchParams(location.search).has('add')) return;
		openAdd('');
		setTimeout(() => replaceState(location.pathname, {})); // router not ready yet on first load
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

	// ---------- day step + swipe ----------
	const step = (n: number) => goto(`/today?d=${addDays(data.day, n)}`, { keepFocus: true, noScroll: true });
	let sx = 0;
	let sy = 0;
	$effect(() => {
		void calendarBus.version;
		if (calendarBus.version) void invalidateAll();
	});
</script>

<svelte:head><title>Today · Life Tracker</title></svelte:head>

<main
	class="today"
	ontouchstart={(e) => ((sx = e.touches[0]?.clientX ?? 0), (sy = e.touches[0]?.clientY ?? 0))}
	ontouchend={(e) => {
		const t = e.changedTouches[0];
		if (!t) return;
		const dx = t.clientX - sx;
		if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(t.clientY - sy)) step(dx < 0 ? 1 : -1);
	}}
>
	<header class="day">
		<!-- wireframe MToday: date line over the title, day arrows on the right -->
		<h1>
			<span class="sub">{prettyDate(data.day)}</span>{isToday
				? 'Today'
				: prettyDate(data.day).split(' ').slice(0, 3).join(' ')}
		</h1>
		{#if !isToday}<a class="btn sm" href="/today">Today</a>{/if}
		<button class="nav" type="button" aria-label="Previous day" onclick={() => step(-1)}>‹</button>
		<button class="nav" type="button" aria-label="Next day" onclick={() => step(1)}>›</button>
	</header>

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

	<section class="card list" aria-labelledby="nt-h">
		<h2 id="nt-h" class="label">To do {isToday ? 'today' : 'this day'} · no time set</h2>
		{#each data.noTime as i (i.id)}
			{@const c = colorsFor(i.type)}
			{@const cd = examCountdown(i, data.today, !!typeOf(i.type)?.countsDown)}
			<div class="row" style:border-left-color={c.edge}>
				<StatusSquare
					status={over[i.id] ?? i.status}
					size={20}
					oncycle={() => cycle('items', i.id, over[i.id] ?? i.status)}
				/>
				<button class="t" type="button" onclick={() => openItem(i.id)}>{i.title}</button>
				{#if cd}<span class="due" class:soon={cd.days <= 3}>{cd.short}</span>{/if}
				<button
					class="clock"
					type="button"
					aria-label="Give {i.title} a time"
					onclick={() => openAdd(`${i.title} `, i.id)}>🕒</button
				>
			</div>
		{:else}<p class="hint">Nothing without a time.</p>{/each}
	</section>

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
</main>

<style>
	.today {
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
	.sub {
		font-size: 13px;
		font-weight: 600;
		color: var(--quiet);
	}
	.nav {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--ink);
		font-size: 22px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: -3px 3px 0 var(--accent); /* same raised look as the header buttons: easy to spot */
	}
	.nav:active {
		translate: -2px 2px;
		box-shadow: 0 0 0 var(--accent);
	}
	.now,
	.list,
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
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		border-left: 4px solid transparent;
		padding: 4px 0 4px 8px;
		min-height: 40px;
	}
	.t {
		flex: 1;
		text-align: left;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		min-height: 32px;
		padding: 0;
	}
	.t:disabled {
		cursor: default;
	}
	.due {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--exam-edge);
	}
	.due.soon {
		background: var(--exam-bg);
		color: var(--exam-ink);
	}
	.clock {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1.5px solid var(--border);
		background: var(--card);
		cursor: pointer;
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
