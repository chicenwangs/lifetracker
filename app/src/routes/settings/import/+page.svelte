<!-- FR-IM1..3 (admin). Notion import from the seed folder on the server (SEED_DIR). Safe to run again. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Import · Life Tracker</title></svelte:head>

<div class="card panel">
	<h1>Import from Notion</h1>
	{#if !data.report}
		<p class="muted">
			No seed found on the server. Put the output of <code>scripts/transform_notion.py</code> (the folder with
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
			<button class="btn primary" type="submit" disabled={busy}>{busy ? 'Importing…' : 'Run import'}</button>
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
</div>

<style>
	.row {
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}
</style>
