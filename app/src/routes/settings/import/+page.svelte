<!-- Import (v3.3 PR 11): a calendar file (.ics) for every signed-in user, own default calendar.
     Notion seed import stays admin-only (FR-IM1..3, SEED_DIR). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$lib/client/refresh';
	import { showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';
	import type { UndoRef } from '$lib/types';
	let { data, form } = $props();
	let busy = $state(false);
	let icsBusy = $state(false);

	type Preview = {
		events: number;
		repeating: number;
		updates: number;
		skipped: { title: string; reason: string }[];
		skippedCapped: boolean;
	};
	type Imported = { imported: number; updated: number; undo: UndoRef };
	const icsPreview = $derived((form as { icsPreview?: Preview } | null)?.icsPreview); // prettier-ignore
	const icsImported = $derived((form as { icsImported?: Imported } | null)?.icsImported); // prettier-ignore
	const icsError = $derived((form as { icsError?: string } | null)?.icsError);

	function icsEnhance() {
		icsBusy = true;
		return async ({
			result,
			update,
		}: {
			result: { type: string; data?: unknown };
			update: (o: { reset: boolean }) => Promise<void>;
		}) => {
			icsBusy = false;
			await update({ reset: false });
			const imp =
				result.type === 'success'
					? (result.data as { icsImported?: Imported } | undefined)?.icsImported
					: undefined;
			if (imp) {
				const u = imp.undo;
				showToast(
					`Imported ${imp.imported} event${imp.imported === 1 ? '' : 's'}` +
						(imp.updated ? ` · updated ${imp.updated}` : ''),
					{ undo: async () => void ((await undoLast(u.id)) && (await invalidateAll())) },
				);
			}
		};
	}
</script>

<svelte:head><title>Import · Life Tracker</title></svelte:head>

<div class="card panel">
	<h1>Import</h1>

	<section class="ics" aria-labelledby="ics-h">
		<h2 id="ics-h">Import a calendar file</h2>
		<p class="muted">
			From Google Calendar, Apple Calendar, Outlook or a timetable export. Events go into your own calendar; a
			file you import again updates the same events (by UID) instead of making copies.
		</p>
		<form method="post" action="?/ics" enctype="multipart/form-data" use:enhance={icsEnhance}>
			<label class="field">
				<span class="label">File (.ics, up to 1 MB)</span>
				<input
					type="file"
					name="file"
					accept=".ics,text/calendar"
					aria-label="Calendar file (.ics)"
					disabled={icsBusy}
				/>
			</label>
			<div class="row">
				<button class="btn primary" type="submit" name="mode" value="preview" disabled={icsBusy}
					>{icsBusy ? 'Reading…' : 'Preview'}</button
				>
				{#if icsPreview?.events}
					<label class="field grow">
						<span class="label">Put them in type</span>
						<select class="input" name="type" value={data.typeDefault}>
							<option value="">No type</option>
							{#each data.types as t (t.key)}<option value={t.key}>{t.name}</option>{/each}
						</select>
					</label>
					<button class="btn primary" type="submit" name="mode" value="import" disabled={icsBusy}
						>Import {icsPreview.events}</button
					>
				{/if}
			</div>
		</form>

		{#if icsError}<p class="alert" role="alert">{icsError}</p>{/if}
		{#if icsPreview}
			<p class="summary" role="status">
				{icsPreview.events} event{icsPreview.events === 1 ? '' : 's'} ·
				{icsPreview.repeating} repeating ·
				{icsPreview.skipped.length}{icsPreview.skippedCapped ? '+' : ''} skipped
			</p>
			{#if icsPreview.updates}
				<p class="hint">Already imported: {icsPreview.updates} will be updated.</p>
			{/if}
			{#if icsPreview.skipped.length}
				<details>
					<summary>Skipped ({icsPreview.skipped.length}{icsPreview.skippedCapped ? '+' : ''})</summary>
					<ul>
						{#each icsPreview.skipped as s, i (i)}
							<li><b>{s.title}</b> — {s.reason}</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}
		{#if icsImported}
			<p class="ok-note" role="status">
				Imported {icsImported.imported} event{icsImported.imported === 1 ? '' : 's'}{icsImported.updated
					? ` · updated ${icsImported.updated}`
					: ''}. Undo is on the toast.
			</p>
		{/if}
	</section>

	{#if data.isAdmin}
		<section class="notion" aria-labelledby="notion-h">
			<h2 id="notion-h">Notion (admin)</h2>
			{#if !data.report}
				<p class="muted">
					No seed found on the server. Put the output of <code>scripts/transform_notion.py</code> (the folder
					with <code>_report.json</code>) in the seed folder (<code>SEED_DIR</code>, default
					<code>data/seed</code>) and reload.
				</p>
			{:else}
				<p class="muted">
					Running it again only adds new rows and refreshes items/blocks you have not edited in the app.
				</p>
				<table class="plain">
					<thead><tr><th>Table</th><th>Rows in seed</th></tr></thead>
					<tbody>
						{#each Object.entries(data.report.counts) as [t, n] (t)}
							<tr><td>{t}</td><td>{n}</td></tr>
						{/each}
					</tbody>
				</table>
				{#if data.report.warnings.length}
					<ul class="hint">
						{#each data.report.warnings as w (w)}<li>{w}</li>{/each}
					</ul>
				{/if}
				<form
					method="post"
					action="?/notion"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							await update({ reset: false });
							busy = false;
						};
					}}
					class="row"
				>
					<label class="field">
						<span class="label">Import into</span>
						<select class="input" name="owner">
							{#each data.users as u (u.username)}
								<option value={u.username} selected={u.username === data.user?.username}
									>{u.name} (@{u.username})</option
								>
							{/each}
						</select>
					</label>
					<button class="btn primary" type="submit" disabled={busy}
						>{busy ? 'Importing…' : 'Run import'}</button
					>
				</form>
			{/if}
			{#if form?.message}<span class="alert" role="alert">{form.message}</span>{/if}
			{#if form?.result}
				<div class="ok-note" role="status">Import done.</div>
				<table class="plain">
					<thead><tr><th>Table</th><th>Present</th><th>New</th><th>Refreshed</th></tr></thead>
					<tbody>
						{#each Object.keys(form.result.counts) as t (t)}
							<tr>
								<td>{t}</td><td>{form.result.counts[t]}</td><td>{form.result.inserted[t] ?? 0}</td><td
									>{form.result.updated[t] ?? 0}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</div>

<style>
	.ics,
	.notion {
		margin-top: 16px;
	}
	.notion {
		border-top: 1px solid var(--rule);
		padding-top: 8px;
	}
	.row {
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 160px;
	}
	.summary {
		margin: 10px 0 0;
		font-weight: 600;
	}
	details {
		margin-top: 6px;
	}
	details ul {
		margin: 6px 0 0;
		padding-left: 20px;
	}
	/* phone: 48 dp controls (#101) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		input[type='file'],
		.input,
		.btn {
			min-height: 48px;
		}
	}
</style>
