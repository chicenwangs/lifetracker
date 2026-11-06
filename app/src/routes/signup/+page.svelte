<!-- FR-A7. Invite-only sign-up. -->
<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	let { form } = $props();
</script>

<svelte:head><title>Create account · Life Tracker</title></svelte:head>

<AuthShell tab="signup">
	<form method="post">
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
			<span class="hint">Sign-up is closed to the public. Ask Jeremy for a code.</span>
		</div>
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
			<span class="hint">At least 10 characters.</span>
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
		{#if form?.message}<div class="alert" role="alert">{form.message}</div>{/if}
	</form>
</AuthShell>
