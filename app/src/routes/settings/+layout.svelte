<script lang="ts">
	import { page } from '$app/state';
	let { children } = $props();
	let nav: HTMLElement | undefined = $state();
	// phone: keep the open section's chip in view
	$effect(() => {
		void page.url.pathname;
		nav?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
	});
	const LINKS = [
		{ href: '/settings/account', label: 'Account' },
		{ href: '/settings/preferences', label: 'Preferences' },
		{ href: '/settings/types', label: 'Item types' },
		{ href: '/settings/notifications', label: 'Notifications' },
		{ href: '/settings/sessions', label: 'Devices' },
		{ href: '/settings/sharing', label: 'Sharing' },
		{ href: '/settings/help', label: 'Help' },
	];
</script>

<main class="wrap">
	<nav class="side card" aria-label="Settings" bind:this={nav}>
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

	.side a {
		transition: background-color var(--t) var(--ease);
	}
	/* phone: one swipe row of chips above the section (same as Keep), page scrolls under the bottom bar */
	@media (max-width: 699px) {
		.wrap {
			padding: 4px 16px 24px;
			gap: 12px;
		}
		.side {
			flex: 1 1 100%;
			flex-direction: row;
			align-items: center;
			gap: 6px;
			overflow-x: auto;
			margin: 0 -16px;
			padding: 2px 16px 4px;
			background: none;
			border: 0;
			box-shadow: none;
			border-radius: 0;
		}
		.side h2 {
			display: none;
		}
		.side a {
			flex: none;
			white-space: nowrap;
			min-height: 36px;
			display: flex;
			align-items: center;
			padding: 0 14px;
			border: 1.5px solid var(--border);
			border-radius: 999px;
			background: var(--card);
			font-size: 13px;
			font-weight: 600;
		}
		.side a.on {
			box-shadow: none;
		}
		.body {
			flex-basis: 100%;
		}
		/* wide tables (types, devices, users) scroll inside their card, never the whole page */
		.body :global(.panel) {
			overflow-x: auto;
		}
	}
</style>
