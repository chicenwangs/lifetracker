<!-- FR-A6. First run only. -->
<script lang="ts">
	// enhance: a failed sign-in shows its message in place. A plain POST answered 4xx would make the Android
	// app show its offline page instead (Capacitor's errorPath on any HTTP error).
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	// success = a full page load, as before (the app shell starts fresh for the signed-in user)
	const signedIn: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'redirect') location.assign(result.location);
			else await update();
		};
	import AuthShell from '$lib/components/AuthShell.svelte';
	let { form } = $props();
</script>

<svelte:head><title>Setup · Life Tracker</title></svelte:head>

<AuthShell>
	<div>
		<h2 class="h">First run setup</h2>
		<p class="hint">
			Make the admin account. Token = <code>SETUP_TOKEN</code> in <code>app/.env</code>. This page is gone
			after.
		</p>
	</div>
	<form method="post" use:enhance={signedIn}>
		<div class="field">
			<label for="tk">Setup token</label>
			<input id="tk" class="input" name="token" type="password" required autocomplete="off" />
		</div>
		<div class="field">
			<label for="u">Username</label>
			<input
				id="u"
				class="input"
				name="username"
				autocomplete="username"
				required
				value={form?.username ?? 'jeremy'}
			/>
		</div>
		<div class="field">
			<label for="dn">Display name</label>
			<input id="dn" class="input" name="displayName" required value={form?.displayName ?? 'Jeremy'} />
		</div>
		<div class="field">
			<label for="p">Password</label>
			<input
				id="p"
				class="input"
				name="password"
				type="password"
				autocomplete="new-password"
				required
				minlength="10"
			/>
			<span class="hint">10–128 characters. Common passwords blocked.</span>
		</div>
		<div class="field">
			<label for="cp">Confirm password</label>
			<input
				id="cp"
				class="input"
				name="confirm"
				type="password"
				autocomplete="new-password"
				required
				minlength="10"
			/>
		</div>
		<button class="btn primary submit" type="submit">Create admin</button>
		{#if form?.message}<div class="alert" role="alert">{form.message}</div>{/if}
	</form>
</AuthShell>

<style>
	.h {
		font-size: 17px;
		margin-bottom: 4px;
	}
	code {
		font-size: 12px;
		background: var(--ground);
		padding: 1px 4px;
		border-radius: 4px;
	}
</style>
