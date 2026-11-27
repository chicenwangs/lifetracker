<!-- Settings › Import: Notion seed import (admin) + card 11 ICS file import (D-V4-12 / D-V4-29 / D-V4-37).
     The .ics preview is an inline panel, not Dialog.svelte: the browser keeps the chosen File and posts it
     again with the chosen type on Import (no server-side temp copy). Errors are inline .alerts, never toasts.
     Both imports share the default action behind an `ics` field, so an old cached page (no field) still
     reaches the Notion import. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { showToast } from '$lib/client/toast.svelte';
	import { undoLast } from '$lib/client/undo.svelte';

	let { data, form } = $props();
	let busy = $state(false);

	interface Skipped {
		title: string;
		reason: string;
	}
	interface Preview {
		events: number;
		repeating: number;
		skipped: Skipped[];
		shortened: number;
		willUpdate: number;
	}
	interface Done {
		events: number;
		imported: number;
		updated: number;
		undo: { id: string; label: string };
	}

	const types = $derived(data.types as { key: string; name: string }[]);
	// C1: the client refuses before upload; the server re-checks the same limit
	const MAX_BYTES = 1_000_000;

	let previewForm = $state<HTMLFormElement>();
	let fileInput = $state<HTMLInputElement>();
	let chosen = $state<File | null>(null);
	let type = $state('');
	let preview = $state<Preview | null>(null);
	let icsError = $state('');
	let loading = $state(false);
	let online = $state(true);

	onMount(() => {
		type = String(data.defaultType ?? '');
		// C12: the page reads navigator.onLine itself (D-V4-29)
		const sync = () => (online = navigator.onLine);
		sync();
		window.addEventListener('online', sync);
		window.addEventListener('offline', sync);
		return () => {
			window.removeEventListener('online', sync);
			window.removeEventListener('offline', sync);
		};
	});

	function picked(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		preview = null;
		icsError = '';
		chosen = file;
		if (!file) return;
		if (file.size > MAX_BYTES) {
			icsError = 'The file is over 1 MB.';
			return;
		}
		loading = true;
		previewForm?.requestSubmit(); // the File stays in the input; ?ics=preview
	}

	function chooseAnother() {
		icsError = '';
		preview = null;
		chosen = null;
		if (!fileInput) return;
		fileInput.value = '';
		fileInput.click();
	}

	function cancel() {
		icsError = '';
		preview = null;
		chosen = null;
		if (fileInput) fileInput.value = '';
	}

	const submit: SubmitFunction = ({ formData }) => {
		const importing = String(formData.get('ics') ?? '') === 'import';
		if (importing) {
			if (!chosen) {
				icsError = 'Choose a calendar file first.';
				return;
			}
			formData.set('file', chosen); // the browser posts the same File again (D-V4-12)
			busy = true;
		} else loading = true;
		return async ({ result, update }) => {
			busy = false;
			loading = false;
			if (result.type === 'failure') {
				icsError = String((result.data as { icsError?: string } | undefined)?.icsError ?? 'Try again.');
				preview = null;
				return;
			}
			if (result.type === 'error') {
				icsError = result.error.message || 'Something broke. Try again.';
				preview = null;
				return;
			}
			if (result.type === 'success') {
				const d = result.data as { ics?: Preview; icsDone?: Done };
				if (d.icsDone) {
					const done = d.icsDone;
					preview = null;
					icsError = '';
					// SHOULD 1: a cleared input lets the same file be picked again for a re-import by UID
					chosen = null;
					if (fileInput) fileInput.value = '';
					showToast(`Imported ${done.events} events`, {
						undo: async () => void (await undoLast(done.undo.id)),
					});
				} else if (d.ics) preview = d.ics;
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:head><title>Import · Life Tracker</title></svelte:head>

<div class="stack">
	<section class="card panel">
		<h1>Calendar file (.ics)</h1>
		<p class="muted">
			Upload a timetable or a Google/Outlook export (up to 1 MB). Each event becomes a planner item in your
			own calendar. Importing the same file again updates the rows it made instead of adding them twice.
		</p>
		{#if !online}<p class="hint">You're offline</p>{/if}
		<form method="post" enctype="multipart/form-data" use:enhance={submit} bind:this={previewForm}>
			<input type="hidden" name="ics" value="preview" />
			<label class="field">
				<span class="label">Calendar file (.ics)</span>
				<input
					class="input"
					type="file"
					name="file"
					accept=".ics,text/calendar"
					bind:this={fileInput}
					onchange={picked}
					disabled={!online || busy || loading}
				/>
			</label>
		</form>

		<div class="preview">
			{#if loading}
				<p class="muted" role="status">Reading file…</p>
			{/if}
			{#if icsError}
				<p class="alert" role="alert">{icsError}</p>
				<button class="btn" type="button" onclick={chooseAnother} disabled={busy}>Choose another file</button>
			{:else if preview}
				<p class="big">
					{preview.events}
					{preview.events === 1 ? 'event' : 'events'} · {preview.repeating} repeating ·
					{preview.skipped.length} skipped
				</p>
				{#if preview.events === 0}
					<p class="muted">No events in this file.</p>
				{/if}
				<form method="post" enctype="multipart/form-data" use:enhance={submit}>
					<input type="hidden" name="ics" value="import" />
					<label class="field">
						<span class="label">Put them in type</span>
						<select class="input" name="type" bind:value={type} disabled={!online || busy}>
							<option value="">None</option>
							{#each types as t (t.key)}
								<option value={t.key}>{t.name}</option>
							{/each}
						</select>
					</label>
					{#if preview.willUpdate}
						<p class="hint">Already imported: {preview.willUpdate} will be updated</p>
					{/if}
					{#if preview.shortened}
						<p class="hint">
							{preview.shortened} title{preview.shortened === 1 ? '' : 's'} shortened to 300 characters.
						</p>
					{/if}
					{#if preview.skipped.length}
						<details>
							<summary>Skipped ({preview.skipped.length})</summary>
							<ul class="skipped">
								{#each preview.skipped as s, i (i)}
									<li>&quot;{s.title}&quot; — {s.reason}</li>
								{/each}
							</ul>
						</details>
					{/if}
					<div class="row">
						<button class="btn" type="button" onclick={cancel} disabled={busy}>Cancel</button>
						<button class="btn primary" type="submit" disabled={!online || busy || preview.events === 0}
							>Import {preview.events}</button
						>
					</div>
				</form>
			{/if}
		</div>
	</section>

	<section class="card panel">
		<h1>Import from Notion</h1>
		{#if !data.report}
			<p class="muted">
				No seed found on the server. Put the output of <code>scripts/transform_notion.py</code> (the folder
				with
				<code>_report.json</code>) in the seed folder (<code>SEED_DIR</code>, default <code>data/seed</code>)
				and reload.
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
				<button class="btn primary" type="submit" disabled={busy}>{busy ? 'Importing…' : 'Run import'}</button
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
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 10px;
	}
	.preview p {
		margin: 0;
	}
	.big {
		font-size: 16px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.skipped {
		margin: 6px 0 0;
		padding-left: 18px;
		font-size: 13px;
	}
	.skipped li {
		overflow-wrap: anywhere;
	}
	summary {
		min-height: 24px;
		cursor: pointer;
	}
	.row {
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}
	/* phone: 48 dp rows and buttons; nothing scrolls sideways (C11) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		summary {
			min-height: 48px;
			padding: 12px 0;
		}
	}
</style>
