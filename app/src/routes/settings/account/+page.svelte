<!-- FR-A10. Profile + change password (kills other sessions). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { USER_COLORS } from '$lib/colors';
	let { data, form } = $props();
	const NAMES: Record<string, string> = {
		'#1C1917': 'Ink',
		'#0F766E': 'Teal',
		'#6D28D9': 'Violet',
		'#B45309': 'Amber',
	};
</script>

<svelte:head><title>Account · Life Tracker</title></svelte:head>

<form
	class="card panel"
	method="post"
	action="?/profile"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	<h1>Account</h1>
	<p class="muted">Signed in as <b>@{data.user?.username}</b> · {data.user?.role}</p>
	<div class="field">
		<label for="dn">Display name</label>
		<input id="dn" class="input" name="displayName" value={data.user?.displayName} required maxlength="60" />
		<span class="hint">Shown to people you share with.</span>
	</div>
	<fieldset class="field">
		<legend class="label">Badge colour</legend>
		<div class="row">
			{#each USER_COLORS as c (c)}
				<label class="sw">
					<input type="radio" name="color" value={c} checked={data.user?.color === c} />
					<span style:background={c} aria-hidden="true"></span>{NAMES[c]}
				</label>
			{/each}
		</div>
	</fieldset>
	<div class="row">
		<button class="btn primary" type="submit">Save</button>
		{#if form?.profileOk}<span class="ok-note">Saved.</span>{/if}
		{#if form?.profileMsg}<span class="alert">{form.profileMsg}</span>{/if}
	</div>
</form>

<form class="card panel" method="post" action="?/password" use:enhance>
	<h2>Change password</h2>
	<p class="hint">Signs out every other device.</p>
	<div class="field">
		<label for="cur">Current password</label>
		<input id="cur" class="input" type="password" name="current" autocomplete="current-password" required />
	</div>
	<div class="field">
		<label for="np">New password</label>
		<input
			id="np"
			class="input"
			type="password"
			name="next"
			autocomplete="new-password"
			required
			minlength="10"
			maxlength="128"
		/>
		<span class="hint">10–128 characters. Common passwords blocked.</span>
	</div>
	<div class="field">
		<label for="cp">Confirm new password</label>
		<input
			id="cp"
			class="input"
			type="password"
			name="confirm"
			autocomplete="new-password"
			required
			minlength="10"
		/>
	</div>
	<div class="row">
		<button class="btn primary" type="submit">Change password</button>
		{#if form?.pwOk}<span class="ok-note">Password changed. Other devices signed out.</span>{/if}
		{#if form?.pwMsg}<span class="alert">{form.pwMsg}</span>{/if}
	</div>
</form>

{#if data.v1 || form?.v1Ok !== undefined}
	<form class="card panel" method="post" action="?/importV1" use:enhance>
		<h2>Old v1 data</h2>
		{#if form?.v1Ok !== undefined}
			<p class="ok-note">Done: {form.v1Ok} notes in Keep, labelled "From v1".</p>
		{:else if data.v1}
			<p class="muted">
				v1 kept some things with no screen in v2:
				{Object.entries(data.v1)
					.filter(([, n]) => n > 0)
					.map(([k, n]) => `${n} ${k}`)
					.join(', ')}. Bring them into Keep as notes, labelled "From v1"? Once only. The originals stay as
				they are.
			</p>
			<div class="row">
				<button class="btn primary" type="submit">Bring them into Keep</button>
				{#if form?.v1Msg}<span class="alert">{form.v1Msg}</span>{/if}
			</div>
		{/if}
	</form>
{/if}

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	.sw {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		font-size: 13px;
	}
	.sw span {
		width: 22px;
		height: 22px;
		border-radius: 11px;
	}
</style>
