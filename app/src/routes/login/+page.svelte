<!-- FR-A1. Real form. Remember me default ON. -->
<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	let { data, form } = $props();
	const remember = $derived(form ? form.remember : true);
</script>

<svelte:head><title>Sign in · Life Tracker</title></svelte:head>

<AuthShell tab="login">
	<form method="post">
		<input type="hidden" name="next" value={data.next} />
		<div class="field">
			<label for="u">Username</label>
			<input
				id="u"
				class="input"
				name="username"
				autocomplete="username"
				required
				value={form?.username ?? ''}
			/>
		</div>
		<div class="field">
			<label for="p">Password</label>
			<input id="p" class="input" name="password" type="password" autocomplete="current-password" required />
		</div>
		<label class="remember">
			<input type="checkbox" name="remember" checked={remember} />
			<span>
				<span class="t">Remember me on this device</span>
				<span class="hint"
					>Stay signed in for 30 days. Each visit extends it. Leave off on shared computers.</span
				>
			</span>
		</label>
		<button class="btn primary submit" type="submit">Sign in</button>
		{#if form?.message}
			<div class="alert" role="alert">{form.message}</div>
		{/if}
	</form>
</AuthShell>

<style>
	.remember {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px;
		border-radius: 10px;
		background: var(--ground);
		cursor: pointer;
	}
	.remember input {
		width: 18px;
		height: 18px;
		margin: 1px 0 0;
		flex: none;
	}
	.remember > span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.t {
		font-weight: 600;
	}
</style>
