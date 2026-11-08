<!-- Login / signup / setup frame (Login.dc.html). App mark only, no name (matches the app header). -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppIcon from './AppIcon.svelte';
	let { tab, children }: { tab?: 'login' | 'signup' | null; children: Snippet } = $props();
</script>

<main class="wrap">
	<div class="col">
		<div class="brand">
			<AppIcon size={44} />
			<h1 class="sr-only">Life Tracker</h1>
		</div>
		<div class="card box">
			{#if tab}
				<nav class="tabs" aria-label="Account">
					<a href="/login" aria-current={tab === 'login' ? 'page' : undefined} class:on={tab === 'login'}
						>Sign in</a
					>
					<a href="/signup" aria-current={tab === 'signup' ? 'page' : undefined} class:on={tab === 'signup'}
						>Create account</a
					>
				</nav>
			{/if}
			{@render children()}
		</div>
	</div>
</main>

<style>
	.wrap {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px 16px;
	}
	.col {
		width: 100%;
		max-width: 420px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.brand {
		display: flex;
		justify-content: center;
		color: var(--ink);
	}
	.box {
		border-radius: 16px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		background: var(--ground);
		border-radius: 10px;
		padding: 3px;
		gap: 3px;
	}
	.tabs a {
		text-align: center;
		padding: 8px;
		border-radius: 8px;
		font-weight: 600;
		color: var(--quiet);
	}
	/* same active pill as the header nav + settings menu */
	.tabs a.on {
		background: var(--rule);
		color: var(--ink);
	}
	.tabs a:hover {
		text-decoration: none;
		color: var(--ink);
	}
	:global(.box form) {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	:global(.box .submit) {
		height: 46px;
		font-size: 15px;
	}
</style>
