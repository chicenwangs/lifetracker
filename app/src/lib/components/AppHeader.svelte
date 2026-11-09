<!-- FR-H15. Nav shows only built pages. -->
<script lang="ts">
	import { page } from '$app/state';
	import QuickAdd from './QuickAdd.svelte';
	import AppIcon from './AppIcon.svelte';
	import { initTheme, setTheme, themeState } from '$lib/client/prefs.svelte';

	let { user }: { user: App.SafeUser } = $props();
	const NAV = [
		{ href: '/', label: 'Home', match: (p: string) => p === '/' },
		{ href: '/week', label: 'Week', match: (p: string) => p.startsWith('/week') },
	];
	let menu = $state(false);
	// svelte-ignore state_referenced_locally
	initTheme(user.theme);
	const dark = $derived(themeState.value === 'dark');
</script>

<header class="hdr">
	<a class="mark" href="/" aria-label="Life Tracker home"><AppIcon size={30} label="" /></a>
	<nav aria-label="Main">
		{#each NAV as n (n.href)}
			<a
				href={n.href}
				class:on={n.match(page.url.pathname)}
				aria-current={n.match(page.url.pathname) ? 'page' : undefined}>{n.label}</a
			>
		{/each}
	</nav>
	<div class="right">
		<QuickAdd tz={user.timezone} />
		<button
			class="theme"
			type="button"
			aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
			title={dark ? 'Light mode' : 'Dark mode'}
			aria-pressed={dark}
			onclick={() => setTheme(dark ? 'light' : 'dark')}
		>
			{#if dark}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
					><circle cx="12" cy="12" r="4" /><path
						d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
					/></svg
				>
			{:else}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg
				>
			{/if}
		</button>
		<div class="acct">
			<button
				class="avatar"
				type="button"
				aria-label="Account menu"
				aria-expanded={menu}
				style:background={user.color}
				onclick={() => (menu = !menu)}>{user.displayName.slice(0, 1).toUpperCase()}</button
			>
			{#if menu}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="menu" onkeydown={(e) => e.key === 'Escape' && (menu = false)}>
					<div class="who">
						<b>{user.displayName}</b><span class="muted">@{user.username}</span>
					</div>
					<a href="/settings/account" onclick={() => (menu = false)}>Account</a>
					<a href="/settings/preferences" onclick={() => (menu = false)}>Preferences</a>
					<a href="/settings/sessions" onclick={() => (menu = false)}>Devices</a>
					<a href="/settings/sharing" onclick={() => (menu = false)}>Sharing</a>
					{#if user.role === 'admin'}<a href="/settings/users" onclick={() => (menu = false)}>Users</a>{/if}
					<form method="post" action="/logout"><button type="submit">Sign out</button></form>
				</div>
			{/if}
		</div>
	</div>
</header>
<svelte:window onclick={(e) => menu && !(e.target as HTMLElement).closest('.acct') && (menu = false)} />

<style>
	.mark {
		display: flex;
		color: var(--ink);
	}
	.mark :global(svg rect:first-child) {
		fill: var(--card);
	}
	.hdr {
		min-height: 64px;
		padding: 12px 24px;
		display: flex;
		align-items: center;
		gap: 24px;
		flex-wrap: wrap;
		position: sticky;
		top: 0;
		z-index: 20;
		background: transparent;
		border-bottom: 0;
	}
	/* blur lives on a layer behind the header: a backdrop-filter on .hdr itself would make it the
	   containing block for position:fixed children and trap the quick-add overlay inside the header */
	.hdr::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		-webkit-backdrop-filter: blur(14px);
		backdrop-filter: blur(14px);
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav a {
		padding: 8px 16px;
		border-radius: 999px;
		font-size: 14px;
		border: 1.5px solid transparent;
		color: var(--ink);
	}
	nav a.on {
		background: var(--pill);
		color: var(--pill-ink);
		border-color: var(--border);
		box-shadow: var(--shadow-btn);
		font-weight: 600;
	}
	nav a:hover {
		color: var(--ink);
		text-decoration: none;
	}
	.right {
		flex: 1 1 320px;
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		align-items: center;
	}
	.acct {
		position: relative;
	}
	.theme {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
		width: 38px;
		height: 38px;
		border-radius: 19px;
		border: 1.5px solid var(--border);
		background: var(--theme-btn);
		color: var(--theme-ink);
		box-shadow: -3px 3px 0 var(--accent);
	}
	.theme:hover {
		filter: brightness(0.97);
	}
	.avatar {
		color: #fff;
		font-weight: 700;
		cursor: pointer;
		width: 38px;
		height: 38px;
		border-radius: 19px;
		border: 1.5px solid var(--border);
		box-shadow: -3px 3px 0 var(--accent);
	}
	.menu {
		position: absolute;
		right: 0;
		background: var(--raised);
		border-radius: 12px;
		min-width: 200px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		top: 48px;
		border: 1.5px solid var(--card-edge);
		box-shadow: var(--shadow-card);
	}
	.who {
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid var(--rule);
		margin-bottom: 4px;
	}
	.menu a,
	.menu button {
		padding: 8px 10px;
		border-radius: 8px;
		color: var(--ink);
		text-align: left;
		background: none;
		border: 0;
		cursor: pointer;
		width: 100%;
		font-size: 13px;
	}
	.menu a:hover,
	.menu button:hover {
		text-decoration: none;
		background: var(--hover);
	}

	/* motion */
	.theme,
	.avatar {
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease),
			background-color var(--t) var(--ease);
	}
	.theme:hover,
	.avatar:hover {
		transform: translate(1px, -1px);
		box-shadow: -3px 3px 0 var(--accent);
	}
	.theme:active,
	.avatar:active {
		transform: translate(-2px, 2px);
		box-shadow: 0 0 0 var(--accent);
	}

	.menu {
		animation: lt-pop 160ms var(--ease) both;
		transform-origin: top right;
	}

	nav a {
		transition:
			background-color var(--t) var(--ease),
			border-color var(--t) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	nav a:not(.on):hover {
		border-color: color-mix(in srgb, var(--border) 35%, transparent);
	}
	.theme svg {
		transition: transform 400ms var(--ease);
	}
	.theme:hover svg {
		transform: rotate(25deg);
	}
	.mark {
		transition: transform var(--t) var(--ease);
	}
	.mark:hover {
		transform: rotate(-6deg) scale(1.06);
	}
</style>
