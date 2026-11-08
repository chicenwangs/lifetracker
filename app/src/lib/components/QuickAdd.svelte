<!--
  FR-Q1..Q3 (rev 2026-11-06c): N opens a centred chat-style palette over a blurred page.
  Any order: title  day  time  [/type]  [/calendar | /both].
  Default = planner block only. /calendar = big event only. /both = item + linked block.
  Once a time is typed, a second window shows that day's timeline with the new entry as a dashed draft
  that moves as you type (crossing midnight = first day only).
  Slots preview live; problems only on Enter. Server re-parses (truth).
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import CommandInput from './CommandInput.svelte';
	import TimelinePreview from './TimelinePreview.svelte';
	import { parseQuickAdd, type QATarget } from '$lib/quickadd';
	import { addDays, nowLocalMinutes, prettyDate, prettyTime, todayLocal } from '$lib/time';
	import { del, get, post } from '$lib/client/api';
	import { calendarBus, calendarChanged } from '$lib/client/bus.svelte';
	import { colorsFor } from '$lib/colors';
	import type { BlockDTO, ItemType } from '$lib/types';

	let { tz }: { tz: string } = $props();

	type Log =
		| { kind: 'me'; text: string }
		| { kind: 'info'; text: string }
		| {
				kind: 'added';
				undoPath: string;
				title: string;
				summary: string;
				undone: boolean;
		  };

	let open = $state(false);
	let text = $state('');
	let busy = $state(false);
	let problems = $state<string[]>([]);
	let log = $state<Log[]>([]);
	let history: string[] = [];

	let cmd: CommandInput | undefined = $state();
	let opener: HTMLButtonElement | undefined = $state();
	let logEl: HTMLDivElement | undefined = $state();

	const ctx = $derived({ today: todayLocal(tz), nowMinutes: nowLocalMinutes(tz) });
	const parsed = $derived(parseQuickAdd(text, ctx));

	// ---------- live timeline ----------
	const preview = $derived.by(() => {
		const p = parsed;
		if (p.startMinutes === null) return null;
		const thin = p.target === 'calendar';
		const end = thin ? p.startMinutes + 30 : (p.endMinutes ?? p.startMinutes + 60);
		return {
			date: p.date,
			draft: {
				start: p.startMinutes,
				end: Math.min(end, 1440),
				title: p.title,
				type: p.typeSet ? p.type : null,
				thin,
				clippedEnd: end > 1440,
				note: thin ? 'calendar item' : end > 1440 ? 'ends next day' : '',
			},
		};
	});
	let dayBlocks = $state<Record<string, BlockDTO[]>>({});
	let loadingDay = $state<string | null>(null);
	async function loadDay(d: string, force = false) {
		if (!force && dayBlocks[d]) return;
		loadingDay = d;
		try {
			const r = await get<{ blocks: BlockDTO[] }>(`/api/calendar?from=${d}&to=${addDays(d, 1)}`);
			dayBlocks = { ...dayBlocks, [d]: r.blocks };
		} catch {
			// not cached: the next keystroke on this day retries
		} finally {
			if (loadingDay === d) loadingDay = null;
		}
	}
	// debounce: fetch the day once typing settles on it
	$effect(() => {
		const d = open ? preview?.date : undefined;
		if (!d) return;
		const t = setTimeout(() => loadDay(d), 120);
		return () => clearTimeout(t);
	});
	// any calendar write elsewhere -> cached days are stale
	$effect(() => {
		void calendarBus.version;
		dayBlocks = {};
	});

	const WHERE: Record<QATarget, string> = {
		planner: 'planner',
		calendar: 'calendar',
		both: 'calendar + planner',
	};
	const WHERE_SLOT: Record<QATarget, string> = {
		planner: 'Planner',
		calendar: 'Calendar',
		both: 'Calendar + planner',
	};
	const shortDate = (d: string) => prettyDate(d).replace(/ \d{4}$/, '');
	const tc = (t: ItemType) => colorsFor(t);

	function timeLabel(p = parsed): string {
		if (!p.time) return p.target === 'calendar' ? 'All day' : 'add a time';
		const s = prettyTime(p.time);
		return p.endTime ? `${s} – ${prettyTime(p.endTime)}${p.endNextDay ? ' (+1 day)' : ''}` : s;
	}
	/** split "use `/x` here" into text + code parts (no {@html}) */
	function segs(s: string): { code: boolean; t: string }[] {
		return s.split('`').map((t, i) => ({ code: i % 2 === 1, t }));
	}

	let prevOverflow = '';
	async function show() {
		if (open) return;
		open = true;
		problems = [];
		prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		await tick();
		cmd?.focus();
	}
	function hide() {
		if (!open) return;
		open = false;
		problems = [];
		document.body.style.overflow = prevOverflow;
		opener?.focus();
	}
	async function scrollLog() {
		await tick();
		logEl?.scrollTo({ top: logEl.scrollHeight });
	}

	async function submit() {
		if (busy) return;
		const p = parseQuickAdd(text, ctx);
		if (!p.ok) {
			problems = p.problems;
			return;
		}
		busy = true;
		const sent = text.trim();
		try {
			const r = await post<{
				item: { id: string; title: string; date: string; type: ItemType | null } | null;
				block: { id: string; label: string; type: ItemType | null } | null;
				target: QATarget;
				notes: string[];
				warnings: string[];
			}>('/api/quickadd', { text: sent });
			history.push(sent);
			log.push({ kind: 'me', text: sent });
			const extra = [...r.notes, ...r.warnings];
			// undo: deleting the item also removes its linked block
			const undoPath = r.item ? `/api/items/${r.item.id}` : `/api/blocks/${r.block?.id ?? ''}`;
			log.push({
				kind: 'added',
				undoPath,
				title: r.item?.title ?? r.block?.label ?? p.title,
				summary:
					`${WHERE[r.target]} · ${shortDate(p.date)} · ${timeLabel(p)} · ${r.item?.type ?? r.block?.type ?? 'None'}` +
					(extra.length ? ` (${extra.join(', ')})` : ''),
				undone: false,
			});
			if (text.trim() === sent) text = ''; // kept if they typed on while it was sending
			problems = [];
			calendarChanged();
			scrollLog();
		} catch (e) {
			problems = [e instanceof Error ? e.message : 'Could not add that. Try again.'];
		} finally {
			busy = false;
		}
	}

	async function undo(entry: Extract<Log, { kind: 'added' }>) {
		try {
			await del(entry.undoPath);
			entry.undone = true;
			log.push({ kind: 'info', text: `Removed ${entry.title}.` });
			calendarChanged();
			scrollLog();
		} catch (e) {
			problems = [e instanceof Error ? e.message : 'Could not undo.'];
		}
	}

	function extraKey(e: KeyboardEvent): boolean {
		if (e.key === 'ArrowUp' && !text && history.length) {
			e.preventDefault();
			text = history[history.length - 1] ?? '';
			return true;
		}
		return false;
	}
	function onEscape() {
		if (text) {
			text = '';
			problems = [];
		} else hide();
	}

	function onWindowKey(e: KeyboardEvent) {
		if (open || (e.key !== 'n' && e.key !== 'N')) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		e.preventDefault();
		show();
	}

	function pop(node: HTMLElement, { duration = 200 }: { duration?: number } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) => `opacity:${Math.min(1, t * 1.6)};transform:scale(${0.92 + 0.08 * t})`,
		};
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<button bind:this={opener} class="opener" type="button" onclick={show} aria-haspopup="dialog">
	<span aria-hidden="true">+</span> Add <kbd>N</kbd>
</button>

{#if open}
	<div
		class="scrim"
		role="presentation"
		transition:fade={{ duration: 160 }}
		onmousedown={(e) => e.target === e.currentTarget && hide()}
	>
		<div
			class="stage"
			class:with-tl={!!preview}
			role="presentation"
			onmousedown={(e) => e.target === e.currentTarget && hide()}
		>
			<div
				class="pal"
				role="dialog"
				aria-modal="true"
				aria-label="Quick add"
				in:pop
				out:pop={{ duration: 120 }}
			>
				<div class="log" bind:this={logEl} aria-live="polite">
					<div class="bot">
						Type what you want to add, in any order. It goes on the planner; add <code>/calendar</code> for a
						big event or
						<code>/both</code> for both. Type <code>/</code> for options.
					</div>
					{#each log as l, i (i)}
						{#if l.kind === 'me'}
							<div class="me">{l.text}</div>
						{:else if l.kind === 'info'}
							<div class="bot">{l.text}</div>
						{:else}
							<div class="bot" class:undone={l.undone}>
								<span aria-hidden="true">✓</span> Added <b>{l.title}</b> to {l.summary}
								{#if !l.undone}<button type="button" class="undo" onclick={() => undo(l)}>Undo</button>{/if}
							</div>
						{/if}
					{/each}
				</div>

				<div class="iwrap">
					<CommandInput
						bind:this={cmd}
						bind:value={text}
						{ctx}
						describedby="qa-slots qa-err"
						onenter={submit}
						onescape={onEscape}
						onkey={extraKey}
						oninput={() => (problems = [])}
					/>
				</div>

				<div class="slots" id="qa-slots">
					{#if parsed.typeSet}
						{@const c = tc(parsed.type)}
						<div class="s" style:background={c.bg} style:color={c.ink} style:border-color={c.bg}>
							<span class="k">Type</span><span class="v">{parsed.type}</span>
						</div>
					{:else}
						<div class="s d"><span class="k">Type</span><span class="v">Event · default</span></div>
					{/if}
					<div class="s" class:d={!parsed.title}>
						<span class="k">Title</span><span class="v">{parsed.title || 'your words'}</span>
					</div>
					<div class="s" class:d={!parsed.targetSet}>
						<span class="k">Goes to</span>
						<span class="v">{parsed.targetSet ? WHERE_SLOT[parsed.target] : 'Planner · default'}</span>
					</div>
					<div class="s" class:d={!parsed.dateSet}>
						<span class="k">Day</span><span class="v"
							>{parsed.dateSet ? shortDate(parsed.date) : 'Today · default'}</span
						>
					</div>
					<div class="s" class:d={!parsed.time}>
						<span class="k">Time{parsed.notes.length ? ` · ${parsed.notes.join(', ')}` : ''}</span>
						<span class="v">{timeLabel()}</span>
					</div>
				</div>

				{#if problems.length}
					<div class="err" id="qa-err" role="alert">
						{#each problems as pr (pr)}
							<div>
								{#each segs(pr) as s, i (i)}{#if s.code}<code>{s.t}</code>{:else}{s.t}{/if}{/each}
							</div>
						{/each}
					</div>
				{/if}

				<div class="ft">
					<span><kbd>Enter</kbd> add · <kbd>/</kbd> options · <kbd>↑</kbd> last</span>
					<span><kbd>Esc</kbd> close</span>
				</div>
			</div>

			{#if preview}
				<div class="tl" transition:pop={{ duration: 160 }}>
					<TimelinePreview
						date={preview.date}
						{tz}
						blocks={dayBlocks[preview.date] ?? []}
						loading={loadingDay === preview.date && !dayBlocks[preview.date]}
						draft={preview.draft}
					/>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.opener {
		height: 36px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--card);
		color: var(--ink);
		font-size: 13px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.opener:hover {
		background: var(--hover);
	}
	kbd {
		font-family: inherit;
		font-size: 11px;
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 0 5px;
		color: var(--quiet);
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12px;
		background: var(--rule);
		border-radius: 4px;
		padding: 0 4px;
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		/* same blur as the item peek (via a var: the minifier keeps only -webkit- otherwise) */
		--qa-blur: blur(8px);
		backdrop-filter: var(--qa-blur);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		overflow-y: auto;
		z-index: 100;
	}
	/* palette stays dead centre; the timeline hangs off its right side (wide screens) or sits below it */
	.stage {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		width: 640px;
		max-width: 100%;
		margin: auto;
	}
	.tl {
		width: 340px;
		max-width: 100%;
	}
	@media (min-width: 1360px) {
		.tl {
			position: absolute;
			left: calc(100% + 20px);
			top: 50%;
			translate: 0 -50%;
		}
	}
	.pal {
		width: 100%;
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 16px 48px var(--shadow);
		color: var(--ink);
	}
	.log {
		max-height: 200px;
		overflow-y: auto;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
	}
	.bot {
		align-self: flex-start;
		color: var(--quiet);
	}
	.bot b {
		color: var(--ink);
		font-weight: 600;
	}
	.bot.undone {
		text-decoration: line-through;
	}
	.me {
		align-self: flex-end;
		background: var(--rule);
		border-radius: 10px;
		padding: 5px 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 13px;
	}
	.undo {
		margin-left: 6px;
		font-size: 12px;
		padding: 1px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
	}
	.iwrap {
		border-top: 1px solid var(--rule);
	}
	.slots {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
		gap: 6px;
		padding: 10px 16px;
		border-top: 1px solid var(--rule);
	}
	.s {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 4px 8px;
		font-size: 12px;
		min-width: 0;
	}
	.s .k {
		display: block;
		font-size: 11px;
		opacity: 0.8;
	}
	.s .v {
		display: block;
		overflow-wrap: anywhere;
		font-weight: 500;
	}
	.s.d {
		border-style: dashed;
	}
	.s.d .k,
	.s.d .v {
		color: var(--quiet);
		font-weight: 400;
	}
	.err {
		margin: 0 16px 10px;
		padding: 8px 10px;
		border-radius: 8px;
		background: var(--exam-bg);
		color: var(--exam-ink);
		font-size: 13px;
		line-height: 1.5;
	}
	.err code {
		background: transparent;
		border: 1px solid currentColor;
		color: inherit;
	}
	.ft {
		display: flex;
		justify-content: space-between;
		padding: 8px 16px;
		font-size: 12px;
		color: var(--quiet);
		border-top: 1px solid var(--rule);
	}
</style>
