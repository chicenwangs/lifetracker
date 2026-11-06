<!--
  FR-Q1..Q3 (rev 2026-11-06): N opens a chat-style palette.
  Any order: /type  title  /calendar|/planner  day  time  [#course].
  Grey ghost text = format guide + completion. `/` or `#` opens a small option menu at the cursor.
  Slots preview live; problems only on Enter. Server re-parses (truth). /planner = item + linked block.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import {
		activeOptionToken,
		ghostHint,
		optionsFor,
		parseQuickAdd,
		type QACourse,
		type QAOption,
	} from '$lib/quickadd';
	import { nowLocalMinutes, prettyDate, prettyTime, todayLocal } from '$lib/time';
	import { del, post } from '$lib/client/api';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { colorsFor } from '$lib/colors';
	import type { ItemType } from '$lib/types';

	let { courses, tz }: { courses: QACourse[]; tz: string } = $props();

	type Log =
		| { kind: 'me'; text: string }
		| { kind: 'info'; text: string }
		| { kind: 'added'; itemId: string; title: string; summary: string; undone: boolean };

	let open = $state(false);
	let text = $state('');
	let busy = $state(false);
	let problems = $state<string[]>([]);
	let log = $state<Log[]>([]);
	let history: string[] = [];
	let menuIdx = $state(0);
	let menuHidden = $state(false);
	let menuLeft = $state(0);

	let input: HTMLInputElement | undefined = $state();
	let opener: HTMLButtonElement | undefined = $state();
	let logEl: HTMLDivElement | undefined = $state();

	const ctx = () => ({ today: todayLocal(tz), nowMinutes: nowLocalMinutes(tz), courses });
	const parsed = $derived(parseQuickAdd(text, ctx()));
	const ghost = $derived(ghostHint(text, parsed, courses));
	const optTok = $derived(activeOptionToken(text));
	const options = $derived(optTok ? optionsFor(optTok, courses) : []);
	const menuOpen = $derived(open && !menuHidden && options.length > 0);
	// what's already picked (ticks in the menu)
	const before = $derived(optTok ? parseQuickAdd(text.slice(0, text.length - optTok.length), ctx()) : parsed);

	const shortDate = (d: string) => prettyDate(d).replace(/ \d{4}$/, '');
	const tc = (t: ItemType) => colorsFor(t);

	function timeLabel(p = parsed): string {
		if (!p.time) return p.target === 'planner' ? 'add a time' : 'All day';
		const s = prettyTime(p.time);
		return p.endTime ? `${s} – ${prettyTime(p.endTime)}${p.endNextDay ? ' (+1 day)' : ''}` : s;
	}
	/** split "use `/x` here" into text + code parts (no {@html}) */
	function segs(s: string): { code: boolean; t: string }[] {
		return s.split('`').map((t, i) => ({ code: i % 2 === 1, t }));
	}
	function picked(o: QAOption): boolean {
		if (o.group === 'Type') return before.typeSet && before.type === o.type;
		if (o.group === 'Goes to')
			return before.targetSet && before.target === (o.token === '/planner' ? 'planner' : 'calendar');
		return before.courseCode === o.label;
	}

	async function show() {
		open = true;
		problems = [];
		await tick();
		input?.focus();
	}
	function hide() {
		open = false;
		problems = [];
		opener?.focus();
	}
	async function scrollLog() {
		await tick();
		logEl?.scrollTo({ top: logEl.scrollHeight });
	}

	function placeMenu() {
		if (!input || !optTok) return;
		const cs = getComputedStyle(input);
		const c = document.createElement('canvas').getContext('2d');
		if (!c) return;
		c.font = cs.font;
		const w = c.measureText(text.slice(0, text.length - optTok.length)).width;
		const left = parseFloat(cs.paddingLeft) + w - input.scrollLeft;
		menuLeft = Math.max(6, Math.min(left, input.clientWidth - 270));
	}
	$effect(() => {
		void optTok;
		void text;
		placeMenu();
	});
	$effect(() => {
		if (menuIdx >= options.length) menuIdx = 0;
	});

	function pick(i: number) {
		const o = options[i];
		if (!o || !optTok) return;
		text = text.slice(0, text.length - optTok.length) + o.token + ' ';
		menuIdx = 0;
		problems = [];
		input?.focus();
	}

	async function submit() {
		if (busy) return;
		const p = parseQuickAdd(text, ctx());
		if (!p.ok) {
			problems = p.problems;
			return;
		}
		busy = true;
		const sent = text.trim();
		try {
			const r = await post<{
				item: { id: string; title: string; date: string; type: ItemType | null };
				block: unknown;
				target: 'calendar' | 'planner';
				notes: string[];
				warnings: string[];
			}>('/api/quickadd', { text: sent });
			history.push(sent);
			log.push({ kind: 'me', text: sent });
			const extra = [...r.notes, ...r.warnings];
			log.push({
				kind: 'added',
				itemId: r.item.id,
				title: r.item.title,
				summary:
					`${r.target === 'planner' ? 'calendar + planner' : 'calendar'} · ${shortDate(r.item.date)} · ${timeLabel(p)} · ${r.item.type ?? 'None'}` +
					(extra.length ? ` (${extra.join(', ')})` : ''),
				undone: false,
			});
			text = '';
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
			await del(`/api/items/${entry.itemId}`);
			entry.undone = true;
			log.push({ kind: 'info', text: `Removed ${entry.title}.` });
			calendarChanged();
			scrollLog();
		} catch (e) {
			problems = [e instanceof Error ? e.message : 'Could not undo.'];
		}
	}

	function onInputKey(e: KeyboardEvent) {
		if (menuOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			menuIdx = (menuIdx + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
			return;
		}
		if (menuOpen && (e.key === 'Enter' || e.key === 'Tab')) {
			e.preventDefault();
			pick(menuIdx);
			return;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			if (menuOpen) menuHidden = true;
			else if (text) {
				text = '';
				problems = [];
			} else hide();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		} else if (e.key === 'Tab') {
			e.preventDefault();
		} else if (e.key === 'ArrowUp' && !text && history.length) {
			e.preventDefault();
			text = history[history.length - 1] ?? '';
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if (open || (e.key !== 'n' && e.key !== 'N')) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		e.preventDefault();
		show();
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<button bind:this={opener} class="opener" type="button" onclick={show} aria-haspopup="dialog">
	<span aria-hidden="true">+</span> Add <kbd>N</kbd>
</button>

{#if open}
	<div class="scrim" role="presentation" onmousedown={(e) => e.target === e.currentTarget && hide()}>
		<div class="pal" role="dialog" aria-modal="true" aria-label="Quick add">
			<div class="log" bind:this={logEl} aria-live="polite">
				<div class="bot">
					Type what you want to add, in any order. Type <code>/</code> to pick a type or where it goes{courses.length
						? ', or # for a course'
						: ''}.
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

			<div class="iw">
				<div class="ghost" aria-hidden="true"><span class="typed">{text}</span>{ghost}</div>
				<input
					bind:this={input}
					bind:value={text}
					class="in"
					autocomplete="off"
					spellcheck="false"
					aria-label="Quick add"
					aria-autocomplete="list"
					aria-controls="qa-menu"
					aria-expanded={menuOpen}
					aria-describedby="qa-slots qa-err"
					oninput={() => {
						problems = [];
						menuHidden = false;
					}}
					onkeydown={onInputKey}
					onscroll={placeMenu}
				/>
				{#if menuOpen}
					<div class="menu" id="qa-menu" role="listbox" style:left="{menuLeft}px">
						{#each options as o, i (o.token)}
							{#if i === 0 || options[i - 1]?.group !== o.group}<div class="mg">{o.group}</div>{/if}
							<div
								class="mi"
								class:on={i === menuIdx}
								role="option"
								tabindex="-1"
								aria-selected={i === menuIdx}
								onmousedown={(e) => {
									e.preventDefault();
									pick(i);
								}}
								onmouseenter={() => (menuIdx = i)}
							>
								{#if o.type}
									<span class="sw" style:background={tc(o.type).bg} style:border-color={tc(o.type).ink}
									></span>
								{:else}
									<span class="sw ic" aria-hidden="true"
										>{o.group === 'Course' ? '#' : o.token === '/planner' ? '◷' : '▦'}</span
									>
								{/if}
								<span class="tok">{o.token}</span>
								{#if picked(o)}<span class="tick" aria-label="selected">✓</span>{/if}
								<span class="hint">{o.hint}</span>
							</div>
						{/each}
						<div class="mfoot">
							Days and times need no slash: <code>fri</code> <code>next mon</code> <code>10 nov</code>
							<code>6pm to 10pm</code>
						</div>
					</div>
				{/if}
			</div>

			<div class="slots" id="qa-slots">
				{#if parsed.typeSet || parsed.courseId}
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
					<span class="v"
						>{!parsed.targetSet
							? 'Calendar · default'
							: parsed.target === 'planner'
								? 'Calendar + planner'
								: 'Calendar'}</span
					>
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
				{#if parsed.courseCode}
					<div class="s"><span class="k">Course</span><span class="v">#{parsed.courseCode}</span></div>
				{/if}
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
		background: rgb(0 0 0 / 0.4);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 10vh;
		z-index: 100;
	}
	.pal {
		width: 640px;
		max-width: calc(100vw - 32px);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 16px 48px rgb(0 0 0 / 0.18);
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
	.iw {
		position: relative;
		border-top: 1px solid var(--rule);
	}
	.ghost,
	.in {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 15px;
		letter-spacing: 0;
		padding: 0 16px;
		height: 52px;
		line-height: 52px;
		white-space: pre;
	}
	.ghost {
		position: absolute;
		inset: 0;
		color: var(--quiet);
		opacity: 0.75;
		pointer-events: none;
		overflow: hidden;
	}
	.typed {
		color: transparent;
	}
	.in {
		position: relative;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--ink);
	}
	.iw:focus-within {
		box-shadow: inset 0 -2px 0 var(--ink);
	}
	.menu {
		position: absolute;
		top: 50px;
		width: 264px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
		padding: 4px;
		z-index: 2;
		font-size: 13px;
	}
	.mg {
		font-size: 11px;
		color: var(--quiet);
		padding: 4px 8px 2px;
	}
	.mi {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 6px;
		cursor: pointer;
	}
	.mi.on {
		background: var(--hover);
		outline: 1px solid var(--border);
	}
	.sw {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		border: 1px solid;
		flex: none;
	}
	.sw.ic {
		border: 0;
		width: 12px;
		font-size: 12px;
		line-height: 12px;
		text-align: center;
		color: var(--quiet);
	}
	.tok {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.tick {
		font-size: 12px;
	}
	.hint {
		margin-left: auto;
		font-size: 11px;
		color: var(--quiet);
	}
	.mfoot {
		font-size: 11px;
		color: var(--quiet);
		padding: 6px 8px 4px;
		margin-top: 4px;
		border-top: 1px solid var(--rule);
		line-height: 1.7;
	}
	.mfoot code {
		font-size: 11px;
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
