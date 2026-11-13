<!-- "Schedule…" = the no-drag way to block time for an item (WCAG 2.5.7, UX-AUDIT #2): pick day + start, get a
     linked block of the default length. -->
<script lang="ts">
	import { page } from '$app/state';
	import { post } from '$lib/client/api';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import { hhmm, localToUtc, nowLocalMinutes, todayLocal, isoPlus } from '$lib/time';
	import type { UndoRef } from '$lib/types';

	let { itemId, title, date }: { itemId: string; title: string; date?: string | null } = $props();
	const tz = $derived(page.data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const len = $derived(page.data.user?.blockMin ?? 60);
	let open = $state(false);
	let day = $state('');
	let time = $state('');
	let busy = $state(false);

	function show() {
		const today = todayLocal(tz);
		day = date && date >= today ? date : today;
		time = hhmm(Math.min(1425, Math.ceil((nowLocalMinutes(tz) + 1) / 15) * 15));
		open = true;
	}
	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (busy || !day || !time) return;
		busy = true;
		try {
			const startAt = localToUtc(day, time, tz);
			const r = await post<{ undo: UndoRef }>('/api/blocks', {
				itemId,
				startAt,
				endAt: isoPlus(startAt, len * 60_000),
			});
			open = false;
			calendarChanged();
			showToast(`Blocked "${title}" ${time}, ${len} min`, { undo: () => void undoLast(r.undo.id) });
		} catch (x) {
			showError(x);
		} finally {
			busy = false;
		}
	}
</script>

<span class="sched">
	<button
		type="button"
		class="sb"
		aria-expanded={open}
		aria-label="Schedule {title}"
		title="Schedule: block time without dragging"
		onclick={(e) => {
			e.stopPropagation();
			if (open) open = false;
			else show();
		}}>Schedule…</button
	>
	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<form class="pop card" onsubmit={save} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
			<label class="field"
				><span class="label">Day</span><input type="date" bind:value={day} required /></label
			>
			<!-- svelte-ignore a11y_autofocus -->
			<label class="field"
				><span class="label">Start</span><input
					type="time"
					step="900"
					bind:value={time}
					required
					autofocus
				/></label
			>
			<span class="hint">{len} min block, linked to the item.</span>
			<div class="row">
				<button class="btn sm" type="button" onclick={() => (open = false)}>Cancel</button>
				<button class="btn sm primary" type="submit" disabled={busy}>Block time</button>
			</div>
		</form>
	{/if}
</span>
<svelte:window onclick={(e) => open && !(e.target as HTMLElement).closest('.sched') && (open = false)} />

<style>
	.sched {
		position: relative;
		display: inline-flex;
	}
	.sb {
		min-height: 24px;
		padding: 0 8px;
		font: inherit;
		font-size: 11px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
	}
	.pop {
		position: absolute;
		top: 28px;
		right: 0;
		z-index: 40;
		width: 220px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}
</style>
