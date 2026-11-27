<!-- Card 04 (D-V4-05, D-V4-17): overdue one-off items, so nothing is lost. Top of the Home planner column and
     the top of Today. Collapsible, expanded everywhere but phone landscape (O-4). Row = item sheet (tap), the
     card 03 reschedule list (⋯, the shared ActionSheet), and on phone swipe right = done, left = delete. -->
<script lang="ts">
	import ActionSheet from './ActionSheet.svelte';
	import { onMount } from 'svelte';
	import { post } from '$lib/client/api';
	import { askDate } from '$lib/client/dialog.svelte';
	import { openItem } from '$lib/client/peek.svelte';
	import { PICK_DATE, RESCHEDULE, reschedule, rescheduleTo } from '$lib/client/reschedule';
	import { deleteRow, toggleDone } from '$lib/client/rowOps';
	import { rowGestures } from '$lib/client/rowGestures';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import { isDate, prettyDate } from '$lib/time';
	import type { ItemDTO, UndoRef } from '$lib/types';

	let { items, total, refresh }: { items: ItemDTO[]; total: number; refresh: () => void | Promise<void> } =
		$props();

	// C8 / O-4: expanded everywhere but phone landscape. `null` = not chosen yet: the list renders, and the
	// landscape media query hides it on the first paint (no full list then jump); onMount settles the state.
	const LANDSCAPE = '(pointer: coarse) and (max-height: 500px)';
	let open = $state<boolean | null>(null);
	onMount(() => {
		open = !matchMedia(LANDSCAPE).matches;
	});

	let acting = $state<ItemDTO | null>(null);
	const nameOf = (i: ItemDTO) => i.title || 'Untitled';
	/** #298: the accessible name carries the visible title + date (label-content-name-mismatch) */
	const rowName = (i: ItemDTO) => (i.date ? `${nameOf(i)}, ${prettyDate(i.date)}` : nameOf(i));
	const more = $derived(total - items.length);

	// C4: the card 03 list, applied to this row (a slipped row never repeats, so no Skip)
	const actionsFor = (i: ItemDTO) => [
		...RESCHEDULE.map((a) => ({ label: a.label, run: () => reschedule(i, a.kind, refresh) })),
		{
			label: PICK_DATE,
			run: async () => {
				const d = await askDate(`Postpone "${nameOf(i)}" to`, { value: i.date ?? '', ok: 'Move' });
				if (d && isDate(d)) await rescheduleTo(i, d, refresh);
			},
		},
	];

	// C5: one request, one undo batch, every matching row (the server owns the set)
	async function moveAll() {
		try {
			const r = await post<{ moved: number; undo?: UndoRef }>('/api/items/move-all');
			await refresh();
			const u = r.undo;
			showToast(`Moved ${r.moved} slipped item${r.moved === 1 ? '' : 's'} to today`, {
				undo: u ? async () => void ((await undoLast(u.id)) && (await refresh())) : undefined,
			});
		} catch (e) {
			showError(e); // C10/C13: the usual toast; nothing is queued offline (D-V4-17)
		}
	}
</script>

{#if total}
	<section class="slip card" aria-label="Slipped" data-open={open === null ? undefined : String(open)}>
		<div class="head">
			<button class="toggle" type="button" aria-expanded={open !== false} onclick={() => (open = !open)}>
				<span class="chev" aria-hidden="true"></span>
				<span class="cap">Slipped · {total}</span>
			</button>
			<button class="all" type="button" onclick={moveAll}>Move all to today</button>
		</div>
		{#if open !== false}
			<ul>
				{#each items as i (i.id)}
					<li
						use:rowGestures={{
							done: () => toggleDone(i, refresh),
							remove: () => deleteRow(i, refresh),
						}}
					>
						<button class="t" type="button" aria-label={rowName(i)} onclick={() => openItem(i.id)}>
							<span class="title">{nameOf(i)}</span>
							<span class="date">{i.date ? prettyDate(i.date) : ''}</span>
						</button>
						<button
							class="more"
							type="button"
							aria-label="Actions for {nameOf(i)}"
							onclick={() => (acting = i)}>⋯</button
						>
					</li>
				{/each}
			</ul>
			{#if more > 0}<p class="rest">{more} more</p>{/if}
		{/if}
	</section>
{/if}

{#if acting}
	<ActionSheet title={nameOf(acting)} actions={actionsFor(acting)} onclose={() => (acting = null)} />
{/if}

<style>
	.slip {
		padding: 6px 12px 8px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.toggle {
		flex: 1;
		min-width: 0;
		min-height: 28px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	.chev {
		flex: none;
		width: 0;
		height: 0;
		border-left: 5px solid currentColor;
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		transition: rotate 150ms var(--ease);
	}
	.toggle[aria-expanded='true'] .chev {
		rotate: 90deg;
	}
	.all {
		flex: none;
		min-height: 26px;
		padding: 0 10px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-btn);
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	ul {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 4px;
		border-top: 1px solid var(--rule);
	}
	.t {
		flex: 1;
		min-width: 0;
		min-height: 32px;
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 2px 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.date {
		flex: none;
		font-size: 12px;
		color: var(--quiet);
	}
	.more {
		flex: none;
		width: 28px;
		min-height: 28px;
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 16px;
		cursor: pointer;
	}
	.rest {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--quiet);
	}
	/* phone: 48 dp (G5) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.toggle,
		.all,
		.t,
		.more {
			min-height: 48px;
		}
		.more {
			width: 48px;
		}
	}
	/* C8 / O-4: phone landscape starts collapsed, in the first paint too (before hydration);
	   data-open=true is the user's explicit expand */
	@media (pointer: coarse) and (max-height: 500px) {
		.slip:not([data-open='true']) ul,
		.slip:not([data-open='true']) .rest {
			display: none;
		}
	}
</style>
