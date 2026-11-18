<!-- FR-A7 (rev 2026-11-08). Open sign-up: make your own account, then swap share codes in Settings > Sharing.
     Admin can switch sign-ups to invite-only; then an invite code is asked for. -->
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
	let { data, form } = $props();
</script>

<svelte:head><title>Create account · Life Tracker</title></svelte:head>

<AuthShell tab="signup">
	<form method="post" use:enhance={signedIn}>
		{#if !data.open}
			<div class="field">
				<label for="code">Invite code</label>
				<input
					id="code"
					class="input"
					name="code"
					required
					placeholder="INV-XXXX-XXXX-XXXX"
					autocomplete="off"
					value={form?.code ?? ''}
				/>
				<span class="hint">New accounts are invite-only right now. Ask the admin for a code.</span>
			</div>
		{/if}
		<div class="field">
			<label for="nu">Username</label>
			<input
				id="nu"
				class="input"
				name="username"
				autocomplete="username"
				required
				value={form?.username ?? ''}
			/>
		</div>
		<div class="field">
			<label for="dn">Display name</label>
			<input
				id="dn"
				class="input"
				name="displayName"
				required
				placeholder="Shown to people you share with"
				value={form?.displayName ?? ''}
			/>
		</div>
		<div class="field">
			<label for="np">Password</label>
			<input
				id="np"
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
		<button class="btn primary submit" type="submit">Create account</button>
		<p class="hint after">Your calendar is private. Share it later with a code in Settings › Sharing.</p>
		{#if form?.message}<div class="alert" role="alert">{form.message}</div>{/if}
	</form>
</AuthShell>

<style>
	.after {
		margin: 0;
		text-align: center;
	}
</style>
