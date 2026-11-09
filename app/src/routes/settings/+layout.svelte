<script lang="ts">
	import { page } from '$app/state';
	let { children } = $props();
	const LINKS = [
		{ href: '/settings/account', label: 'Account' },
		{ href: '/settings/preferences', label: 'Preferences' },
		{ href: '/settings/sessions', label: 'Devices' },
		{ href: '/settings/sharing', label: 'Sharing' },
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
		{#if page.data.user?.role === 'admin'}
			<a
				href="/settings/users"
				class:on={page.url.pathname === '/settings/users'}
				aria-current={page.url.pathname === '/settings/users' ? 'page' : undefined}>Users</a
			>
			<a
				href="/settings/import"
				class:on={page.url.pathname === '/settings/import'}
				aria-current={page.url.pathname === '/settings/import' ? 'page' : undefined}>Import</a
			>
		{/if}
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
		background: var(--pill-card);
		color: #00003d;
		font-weight: 600;
		box-shadow: inset 0 0 0 1.5px var(--border);
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
