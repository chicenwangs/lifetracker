<!-- Settings › Item types (FEATURES §3b): order, colour, name, quick-add word, use, flags, delete + move. -->
<script lang="ts">
	import { backCloses } from '$lib/client/layers';
	import { invalidateAll } from '$lib/client/refresh';
	import { del, patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import { MAX_TYPES, TYPE_SWATCHES } from '$lib/itemtypes';
	import type { ItemTypeDTO, UndoRef } from '$lib/types';

	let { data } = $props();
	const types = $derived(data.types as ItemTypeDTO[]);

	async function save(t: ItemTypeDTO, p: Record<string, unknown>) {
		try {
			await patch(`/api/item-types/${t.id}`, p);
			await invalidateAll();
		} catch (e) {
			showError(e);
			await invalidateAll();
		}
	}
	async function move(i: number, d: -1 | 1) {
		const ids = types.map((t) => t.id);
		const j = i + d;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
		try {
			await post('/api/item-types/reorder', { ids });
			await invalidateAll();
		} catch (e) {
			showError(e);
		}
	}

	// ---------- delete + move ----------
	let deleting = $state<ItemTypeDTO | null>(null);
	let moveTo = $state('');
	async function remove() {
		const t = deleting;
		if (!t) return;
		try {
			const r = await del<{ moved: number; undo: UndoRef }>(`/api/item-types/${t.id}`, {
				moveTo: moveTo || null,
			});
			deleting = null;
			await invalidateAll();
			showToast(`Deleted type "${t.name}"${r.moved ? `, moved ${r.moved}` : ''}`, {
				undo: async () => void ((await undoLast(r.undo.id)) && (await invalidateAll())),
			});
		} catch (e) {
			showError(e);
		}
	}
</script>

<svelte:head><title>Item types · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Item types</h1>
	<p class="muted">
		Colours and names for your items and blocks. Quick add with no /type makes it No type. "Counts down" shows
		days left on the month chip and due list.
	</p>
	<div
		class="meter"
		role="meter"
		aria-label="Item types used"
		aria-valuemin="0"
		aria-valuemax={MAX_TYPES}
		aria-valuenow={types.length}
	>
		<span style:width="{(types.length / MAX_TYPES) * 100}%"></span>
	</div>
	<span class="hint">{types.length} / {MAX_TYPES} types. "No type" is always there and doesn't count.</span>

	<table>
		<colgroup>
			<col class="ord" /><col class="col-colour" /><col class="col-name" /><col class="col-slug" /><col
				class="used"
			/><col class="col-month" /><col class="counts" /><col class="shares" /><col class="col-del" />
		</colgroup>
		<thead>
			<tr
				><th class="ord">Order</th><th class="col-colour">Colour</th><th class="col-name">Name</th><th
					class="col-slug">Quick add</th
				><th class="used">Used</th><th class="col-month">Month calendar</th><th class="counts">Counts down</th
				><th class="shares">Share by default</th><th class="col-del"></th></tr
			>
		</thead>
		<tbody>
			{#each types as t, i (t.id)}
				<tr>
					<td class="ord">
						<button
							class="mini"
							type="button"
							aria-label="Move {t.name} up"
							disabled={i === 0}
							onclick={() => move(i, -1)}>↑</button
						><button
							class="mini"
							type="button"
							aria-label="Move {t.name} down"
							disabled={i === types.length - 1}
							onclick={() => move(i, 1)}>↓</button
						>
					</td>
					<td>
						<select
							class="color"
							aria-label="Colour of {t.name}"
							style:background={t.bg}
							style:color={t.ink}
							value={t.bg}
							onchange={(e) => save(t, { bg: e.currentTarget.value })}
						>
							{#each [...new Set([t.bg, ...TYPE_SWATCHES])] as s (s)}<option value={s} style:background={s}
									>{s}</option
								>{/each}
						</select>
					</td>
					<td
						><input
							aria-label="Name of {t.name}"
							value={t.name}
							maxlength="30"
							onchange={(e) => e.currentTarget.value.trim() && save(t, { name: e.currentTarget.value })}
						/></td
					>
					<td class="slug"
						>/<input
							aria-label="Quick-add word for {t.name}"
							value={t.slug}
							maxlength="20"
							onchange={(e) => save(t, { slug: e.currentTarget.value })}
						/></td
					>
					<td class="num used">{t.used ?? 0}</td>
					<td
						><label class="cb"
							><input
								type="checkbox"
								role="switch"
								aria-label="Month calendar for {t.name}"
								checked={t.onCalendar}
								onchange={(e) => save(t, { onCalendar: e.currentTarget.checked })}
							/></label
						></td
					>
					<td class="counts"
						><label class="cb"
							><input
								type="checkbox"
								aria-label="{t.name} counts down"
								checked={t.countsDown}
								onchange={(e) => save(t, { countsDown: e.currentTarget.checked })}
							/></label
						></td
					>
					<td class="shares"
						><label class="cb"
							><input
								type="checkbox"
								aria-label="Share {t.name} by default"
								checked={t.shareDefault}
								onchange={(e) => save(t, { shareDefault: e.currentTarget.checked })}
							/></label
						></td
					>
					<td>
						{#if t.builtin}<span class="hint">built-in</span>{:else}
							<button
								class="btn sm"
								type="button"
								onclick={() => {
									deleting = t;
									moveTo = '';
								}}>Delete</button
							>
						{/if}
					</td>
				</tr>
				<!-- phone only (D-V4-28): the two older flags sit under the name, so every switch keeps its 48 dp tap
				     area without a sideways scroll; desktop shows them as the columns above -->
				<tr class="extra">
					<td colspan="9">
						<div class="flags">
							<label class="cb"
								><input
									type="checkbox"
									aria-label="{t.name} counts down"
									checked={t.countsDown}
									onchange={(e) => save(t, { countsDown: e.currentTarget.checked })}
								/>Counts down</label
							>
							<label class="cb"
								><input
									type="checkbox"
									aria-label="Share {t.name} by default"
									checked={t.shareDefault}
									onchange={(e) => save(t, { shareDefault: e.currentTarget.checked })}
								/>Share by default</label
							>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="hint">Off = hidden on Month, still on Week, Today and reminders.</p>
	<p class="hint">New types: the + at the end of the type bar on Home or Week.</p>
</section>

{#if deleting}
	{@const t = deleting}
	<div class="scrim" role="presentation" onclick={() => (deleting = null)}></div>
	<div
		use:backCloses={() => (deleting = null)}
		class="dialog card"
		role="dialog"
		aria-modal="true"
		aria-labelledby="del-h"
	>
		<h2 id="del-h">Delete "{t.name}"?</h2>
		<p>{t.used ?? 0} items and blocks use it. Move them to:</p>
		<select bind:value={moveTo} aria-label="Move them to">
			<option value="">No type</option>
			{#each types.filter((x) => x.id !== t.id) as x (x.id)}<option value={x.key}>{x.name}</option>{/each}
		</select>
		<div class="row">
			<button class="btn sm" type="button" onclick={() => (deleting = null)}>Cancel</button>
			<button class="btn sm primary" type="button" onclick={remove}>Delete and move</button>
		</div>
		<span class="hint">You can undo for 5 s.</span>
	</div>
{/if}
<svelte:window onkeydown={(e) => e.key === 'Escape' && deleting && (deleting = null)} />

<style>
	.meter {
		height: 8px;
		border-radius: 4px;
		background: var(--rule);
		overflow: hidden;
		margin-top: 8px;
	}
	.meter span {
		display: block;
		height: 100%;
		background: var(--ink);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		margin-top: 12px;
	}
	th {
		text-align: left;
		font-size: max(var(--fs-min), 11px);
		color: var(--muted);
		font-weight: 600;
		padding: 6px 4px;
	}
	td {
		padding: 6px 4px;
		border-top: 1px solid var(--rule);
	}
	td input:not([type]) {
		width: 100%;
		min-width: 80px;
	}
	.slug {
		white-space: nowrap;
	}
	.slug input {
		width: 90px;
	}
	.num {
		text-align: right;
	}
	/* phone-only stacked flags row, see the media query */
	.extra {
		display: none;
	}
	.mini {
		min-width: 24px;
		min-height: 24px;
		cursor: pointer;
	}
	/* phone: the label is the 48 dp tap area (#101) */
	.cb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
	}
	.color {
		min-height: 24px;
		width: 90px;
		border-radius: 6px;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.color {
			min-height: 48px;
		}
		/* D-V4-28: phone keeps Colour, Name, Quick add and Month calendar (plus the delete cell) in the main row;
		   Counts down and Share by default move to the stacked row under it, so all seven stay reachable at 48 dp
		   with no sideways scroll */
		.extra {
			display: table-row;
		}
		.extra > td {
			padding: 0 2px 6px;
			border-top: 0;
		}
		.extra .flags {
			display: flex;
			flex-wrap: wrap;
			gap: 0 12px;
		}
		.extra .cb {
			padding-right: 2px;
		}
		table {
			table-layout: fixed;
		}
		/* five columns inside 344 px. Hidden cells stay in the row (visibility, not display:none) so the other
		   cells keep their column, the <col> widths below land on the right columns, and header and body agree. */
		th.ord,
		td.ord,
		th.used,
		td.used,
		th.counts,
		td.counts,
		th.shares,
		td.shares {
			visibility: hidden;
			width: 0;
			padding: 0;
			border: 0;
			overflow: hidden;
			font-size: 0; /* the header text must not wrap inside a 0-width column and add height */
			line-height: 0;
		}
		/* their controls must not keep the row tall or take focus (the Used cell holds text only) */
		.ord > *,
		.counts > *,
		.shares > * {
			display: none;
		}
		col.ord,
		col.used,
		col.counts,
		col.shares {
			width: 0;
		}
		.col-colour {
			width: 16%;
		}
		.col-name {
			width: 32.5%;
		}
		.col-slug {
			width: 17.5%;
		}
		.col-month {
			width: 17%;
		}
		.col-del {
			width: 17%;
		}
		th,
		td {
			padding: 6px 2px;
			overflow-wrap: anywhere;
		}
		.color {
			width: 100%;
			min-width: 0;
		}
		td input:not([type]) {
			min-width: 0;
		}
		.slug input {
			width: 100%;
		}
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.3);
		z-index: 60;
	}
	.dialog {
		position: fixed;
		top: 30%;
		left: 50%;
		transform: translateX(-50%);
		z-index: 61;
		padding: 20px;
		width: min(380px, 90vw);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
</style>
