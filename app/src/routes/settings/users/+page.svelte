<!-- Admin: sign-up mode + accounts (with storage used: uploaded files vs the per-person quota). New installs start invite-only. Disable = can't log in, signed out everywhere. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { prettyDate, utcToLocal } from '$lib/time';
	let { data, form } = $props();
	const size = (n: number) =>
		n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`; // prettier-ignore
	const day = (z: string) => prettyDate(utcToLocal(z, data.user?.timezone ?? 'Asia/Kuala_Lumpur').date);
</script>

<svelte:head><title>Users · Life Tracker</title></svelte:head>

<div class="card panel">
	<h1>Users</h1>
	<form method="post" action="?/mode" use:enhance class="mode">
		<fieldset>
			<legend class="label">New accounts</legend>
			<label class="opt">
				<input type="radio" name="open" value="1" checked={data.open} />
				<span><b>Open</b><span class="hint">Anyone with the link can make their own account.</span></span>
			</label>
			<label class="opt">
				<input type="radio" name="open" value="0" checked={!data.open} />
				<span
					><b>Invite only</b><span class="hint">Sign-up asks for an invite code you make below.</span></span
				>
			</label>
		</fieldset>
		<div class="row">
			<button class="btn" type="submit">Save</button>
			{#if form?.saved}<span class="ok-note">Saved.</span>{/if}
		</div>
	</form>

	{#if !data.open}
		<div class="inv">
			<div class="row" style="justify-content: space-between">
				<h2>Invite codes</h2>
				<form method="post" action="?/invite" use:enhance>
					<button class="btn primary" type="submit">Make invite code</button>
				</form>
			</div>
			{#if form?.code}
				<div class="code" role="status">
					<code>{form.code}</code>
					<button class="btn sm" type="button" onclick={() => navigator.clipboard?.writeText(form.code)}
						>Copy</button
					>
					<span class="hint">Shown once. Works for 7 days, one account.</span>
				</div>
			{/if}
			{#each data.invites as i (i.id)}
				<form method="post" action="?/revoke" use:enhance class="row inv-row">
					<input type="hidden" name="id" value={i.id} />
					<span>Unused code · expires {day(i.expiresAt)}</span>
					<button class="btn sm danger" type="submit">Cancel</button>
				</form>
			{:else}
				<span class="muted">No unused codes.</span>
			{/each}
		</div>
	{/if}

	<h2>Accounts</h2>
	{#if form?.disabledName}<p class="ok-note" role="status">{form.disabledName} can't log in now.</p>{/if}
	{#if form?.message}<span class="alert" role="alert">{form.message}</span>{/if}
	<table class="plain">
		<thead
			><tr
				><th>Name</th><th>Username</th><th>Role</th><th>Storage</th><th
					><span class="sr-only">Actions</span></th
				></tr
			></thead
		>
		<tbody>
			{#each data.users as u (u.id)}
				{@const used = data.storage[u.id] ?? 0}
				<tr>
					<td><span class="dot" style:background={u.color} aria-hidden="true"></span>{u.displayName}</td>
					<td>@{u.username}</td>
					<td>{data.disabled.includes(u.id) ? 'disabled' : u.role}</td>
					<td class="store" title="Uploaded files and images. Quota per person: {size(data.quota)}">
						{size(used)} <span class="muted">of {size(data.quota)}</span>
						<span class="bar" aria-hidden="true"
							><span style:width="{Math.min(100, (used / data.quota) * 100)}%"></span></span
						>
					</td>
					<td>
						{#if u.role !== 'admin' && !data.disabled.includes(u.id)}
							<form
								method="post"
								action="?/disable"
								use:enhance={({ cancel }) => {
									if (
										!confirm(
											`Disable ${u.displayName}? They are signed out and can't log in. Their data stays.`,
										)
									)
										cancel();
								}}
							>
								<input type="hidden" name="id" value={u.id} />
								<button class="btn sm danger" type="submit">Disable</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.store {
		white-space: nowrap;
		font-size: 13px;
	}
	.bar {
		display: block;
		height: 4px;
		margin-top: 4px;
		border-radius: 2px;
		background: var(--rule);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--ink);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.mode {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.opt {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--ground);
		cursor: pointer;
	}
	.opt input {
		margin-top: 3px;
	}
	.opt > span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	h2 {
		font-size: 15px;
		margin-top: 8px;
	}
	.inv {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.code {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 10px 12px;
		border: 1.5px dashed var(--ink);
		border-radius: 10px;
	}
	.code code {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.inv-row {
		justify-content: space-between;
	}
	.dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 5px;
		margin-right: 8px;
	}
</style>
