<!--
  Command box for a range dragged on a timeline (planner or week), or a month day (`day`: no time,
  defaults to the calendar).
  Same grammar as the N palette. The dragged day/time is used unless you type one.
  Default goes to the planner only; Calendar / Both are one click (or /calendar, /both).
-->
<script lang="ts">
	import { page } from '$app/state';
	import CommandInput from './CommandInput.svelte';
	import { parseQuickAdd, withTarget, type QAParse, type QATarget } from '$lib/quickadd';
	import { nowLocalMinutes, prettyDate, todayLocal } from '$lib/time';
	import { del, post } from '$lib/client/api';
	import { showToast } from '$lib/client/toast.svelte';
	import { calendarChanged } from '$lib/client/bus.svelte';

	let {
		date,
		start = 0,
		end = 0,
		day = false,
		autofocus = true,
		onparsed,
		ondone,
		oncancel,
	}: {
		date: string;
		start?: number;
		end?: number;
		day?: boolean;
		autofocus?: boolean;
		onparsed?: (p: QAParse) => void;
		ondone: () => void;
		oncancel: () => void;
	} = $props();

	let text = $state('');
	let busy = $state(false);
	let problem = $state('');
	let cmd: CommandInput | undefined = $state();

	const tz = $derived(page.data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const ctx = $derived({
		today: todayLocal(tz),
		nowMinutes: nowLocalMinutes(tz),
		slot: day ? { date, start: 0, end: 0, day: true } : { date, start, end },
	});
	const parsed = $derived(parseQuickAdd(text, ctx));
	$effect(() => {
		onparsed?.(parsed);
	});

	const TARGETS: { t: QATarget; label: string }[] = [
		{ t: 'planner', label: 'Planner' },
		{ t: 'calendar', label: 'Calendar' },
		{ t: 'both', label: 'Both' },
	];
	const moved = $derived(parsed.date !== date ? prettyDate(parsed.date).replace(/ \d{4}$/, '') : '');

	function setTarget(t: QATarget) {
		text = withTarget(text, t);
		problem = '';
		cmd?.focus();
	}

	async function submit() {
		if (busy) return;
		if (!text.trim()) return oncancel();
		if (!parsed.ok) {
			problem = (parsed.problems[0] ?? 'Could not add that.').replace(/`/g, '');
			return;
		}
		busy = true;
		try {
			const r = await post<{
				item: { id: string; title: string } | null;
				block: { id: string; label: string } | null;
			}>('/api/quickadd', {
				text: text.trim(),
				slot: day ? { date, start: 0, end: 0, day: true } : { date, start, end },
			});
			const path = r.item ? `/api/items/${r.item.id}` : `/api/blocks/${r.block?.id ?? ''}`;
			const name = r.item?.title ?? r.block?.label ?? parsed.title;
			const where =
				parsed.target === 'planner'
					? 'planner'
					: parsed.target === 'calendar'
						? 'calendar'
						: 'calendar + planner';
			showToast(`Added "${name}" to ${where}`, {
				undo: async () => {
					await del(path);
					calendarChanged();
				},
			});
			calendarChanged();
			ondone();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not add that. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="sc lt-slotcmd">
	<CommandInput
		bind:this={cmd}
		bind:value={text}
		{ctx}
		slotted={day ? 'day' : true}
		size="sm"
		label="New entry. Type a title, options like /hobby or /calendar"
		{autofocus}
		onenter={submit}
		onescape={oncancel}
		oninput={() => (problem = '')}
		onblur={() => !text.trim() && !busy && oncancel()}
	/>
	<div class="row">
		<div class="seg" role="group" aria-label="Goes to">
			{#each TARGETS as o (o.t)}
				<button
					type="button"
					class:on={parsed.target === o.t}
					aria-pressed={parsed.target === o.t}
					onmousedown={(e) => e.preventDefault()}
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => setTarget(o.t)}>{o.label}</button
				>
			{/each}
		</div>
		<span class="hint">
			{#if moved}→ {moved}{:else if parsed.target === 'planner'}planner only{:else if parsed.target === 'calendar'}calendar
				item, no block{:else}item + block{/if}
		</span>
	</div>
	{#if problem}<div class="err" role="alert">{problem}</div>{/if}
</div>

<style>
	.sc {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--ink);
	}
	/* sits on a backing so it stays readable when it hangs below a short box */
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		align-self: flex-start;
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 3px 8px 3px 3px;
		box-shadow: 0 4px 12px var(--shadow);
	}
	.seg {
		display: inline-flex;
		border-radius: 7px;
		overflow: hidden;
		background: var(--card);
		border: 1.5px solid var(--border);
	}
	.seg button {
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 11px;
		padding: 2px 8px;
		cursor: pointer;
	}
	.seg button + button {
		border-left: 1px solid var(--border);
	}
	.seg button.on {
		font-weight: 600;
		background: var(--seg-on);
		color: var(--seg-on-ink);
	}
	.hint {
		font-size: 11px;
		color: var(--quiet);
	}
	.err {
		align-self: flex-start;
		font-size: 12px;
		padding: 4px 8px;
		border-radius: 6px;
		background: var(--exam-bg);
		color: var(--exam-ink);
	}
</style>
