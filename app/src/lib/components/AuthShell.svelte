<!-- Login / signup / setup frame (Login.dc.html). -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let { tab, children }: { tab?: 'login' | 'signup' | null; children: Snippet } = $props();
</script>

<main class="wrap">
	<div class="col">
		<div class="brand">
			<div class="logo" aria-hidden="true">
				<span class="t-work"></span><span class="t-exam"></span><span class="t-event"></span><span
					class="t-dating"
				></span>
			</div>
			<h1>Life Tracker</h1>
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
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	h1 {
		font-size: 22px;
		font-weight: 700;
	}
	.logo {
		display: grid;
		grid-template-columns: repeat(2, 14px);
		gap: 4px;
	}
	.logo span {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--bg);
		border: 1.5px solid var(--fg);
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
	.tabs a.on {
		background: #fff;
		color: var(--ink);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
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
