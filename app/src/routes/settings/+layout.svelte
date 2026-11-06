<script lang="ts">
	import { page } from '$app/state';
	let { children } = $props();
	const LINKS = [
		{ href: '/settings/account', label: 'Account' },
		{ href: '/settings/sessions', label: 'Devices' },
		{ href: '/settings/courses', label: 'Courses' },
		{ href: '/settings/goals', label: 'Goals' },
	];
</script>

<main class="wrap">
	<nav class="side card" aria-label="Settings">
		<h2>Settings</h2>
		{#each LINKS as l (l.href)}
			<a
				href={l.href}
				class:on={page.url.pathname === l.href}
				aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a
			>
		{/each}
		<a href="/trash" class:on={page.url.pathname === '/trash'}>Trash</a>
	</nav>
	<section class="body">{@render children()}</section>
</main>

<style>
	.wrap {
		padding: 20px 24px;
		display: flex;
		gap: 20px;
		align-items: flex-start;
		max-width: 1100px;
		margin: 0 auto;
		flex-wrap: wrap;
	}
	.side {
		flex: 0 0 200px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.side h2 {
		font-size: 13px;
		color: var(--quiet);
		padding: 4px 10px 8px;
	}
	.side a {
		padding: 8px 10px;
		border-radius: 8px;
		color: var(--ink);
		font-size: 14px;
	}
	.side a.on {
		background: var(--rule);
		font-weight: 600;
	}
	.side a:hover {
		text-decoration: none;
		background: var(--ground);
	}
	.body {
		flex: 1 1 560px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.body :global(.panel) {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.body :global(h1) {
		font-size: 20px;
	}
	.body :global(h2) {
		font-size: 15px;
	}
	.body :global(.row) {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
