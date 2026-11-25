<!-- v3.2 PR 4: the Slipped strip — one-off top-level items whose last day is behind today (a normal repeat
     never slips). Home above the planner, and at the top of Today on the phone: swipe right = done, left =
     delete, ⋯ = the shared reschedule list + done/delete by tap, Move all to today = one undo batch. -->
<script lang="ts">
	import ActionSheet from './ActionSheet.svelte';
	import RepeatMark from './RepeatMark.svelte';
	import { colorsFor } from '$lib/colors';
	import { post } from '$lib/client/api';
	import { openItem } from '$lib/client/peek.svelte';
	import { postpones } from '$lib/client/reschedule';
	import { deleteRow, toggleDone } from '$lib/client/rowOps';
	import { rowGestures } from '$lib/client/rowGestures';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import { prettyDate } from '$lib/time';
	import type { ItemDTO, UndoRef } from '$lib/types';

	let {
		items,
		more = 0,
		today,
		tz,
		refresh,
	}: {
		items: ItemDTO[];
		more?: number;
		today: string;
		tz: string;
		refresh: () => void | Promise<void>;
	} = $props();

	let open = $state(true);
	let acting = $state<ItemDTO | null>(null);
	const total = $derived(items.length + more);
	const short = (d: string) => prettyDate(d).replace(/ \d{4}$/, ''); // "Mon 18 Nov"

	// closures over a plain value: ActionSheet closes (acting = null) before run() fires (#324)
	const actionsFor = (i: ItemDTO) => [
		...postpones(i, { today, tz, refresh }),
		{ label: i.status === 'done' ? 'Not done' : 'Done', run: () => toggleDone(i, refresh) },
		{ label: 'Delete', danger: true, run: () => deleteRow(i, refresh) },
	];

	/** one undo batch for the whole list */
	async function moveAll() {
		try {
			const r = await post<{ moved: number; undo?: UndoRef }>('/api/items/slipped');
			await refresh();
			const u = r.undo;
			showToast(r.moved ? `Moved ${r.moved} to today` : 'Nothing slipped', {
				undo: u ? async () => void ((await undoLast(u.id)) && (await refresh())) : undefined,
			});
		} catch (e) {
			showError(e);
		}
	}
</script>

{#if items.length}
	<section class="slip card" aria-label="Slipped items">
		<header>
			<button class="cap" type="button" aria-expanded={open} onclick={() => (open = !open)}>
				Slipped · {total}
				<span class="chev" class:up={open} aria-hidden="true">▾</span>
			</button>
			<button class="btn sm primary" type="button" onclick={moveAll}>Move all to today</button>
		</header>
		{#if open}
			<ul>
				{#each items as i (i.id)}
					{@const c = colorsFor(i.type)}
					<li
						class="rw"
						use:rowGestures={{
							done: () => toggleDone(i, refresh),
							remove: () => deleteRow(i, refresh),
						}}
					>
						<span class="dot" style:background={c.bg} aria-hidden="true"></span>
						<button class="t" type="button" onclick={() => openItem(i.id)}>{i.title}</button>
						<RepeatMark item={i} />
						<span class="od">{i.date ? short(i.date) : ''}</span>
						<button class="more" type="button" aria-label="Actions for {i.title}" onclick={() => (acting = i)}
							>⋯</button
						>
					</li>
				{/each}
			</ul>
			{#if more}<p class="rest">{more} more</p>{/if}
		{/if}
	</section>
	{#if acting}
		<ActionSheet title={acting.title} actions={actionsFor(acting)} onclose={() => (acting = null)} />
	{/if}
{/if}

<style>
	.slip {
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.cap {
		border: 0;
		background: none;
		color: var(--quiet);
		font: inherit;
		font-size: max(var(--fs-min), 11px);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		padding: 0;
		min-height: 24px;
	}
	.chev {
		display: inline-block;
		margin-left: 4px;
		transition: rotate 120ms ease;
	}
	.chev.up {
		rotate: 180deg;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.rw {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		padding: 0 2px;
		border-top: 1px solid var(--rule);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex: none;
	}
	.t {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		padding: 0;
	}
	.t:hover {
		text-decoration: underline;
	}
	.od {
		color: var(--quiet);
		font-size: max(var(--fs-min), 11px);
		white-space: nowrap;
	}
	.more {
		flex: none;
		width: 24px;
		height: 24px;
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
	}
	.rest {
		margin: 4px 2px 0;
		color: var(--quiet);
		font-size: 12px;
	}
	/* phone (#101): 48 dp rows and controls */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.cap,
		.t,
		.more {
			min-height: 48px;
		}
		.more {
			width: 48px;
		}
		.rw {
			min-height: 48px;
		}
		.t {
			font-size: 15px;
		}
	}
</style>
