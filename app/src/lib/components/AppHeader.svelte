<!-- FR-H15. Nav shows only built pages. -->
<script lang="ts">
	import { page } from '$app/state';
	import QuickAdd from './QuickAdd.svelte';
	import type { QACourse } from '$lib/quickadd';
	import { initTheme, setTheme, themeState } from '$lib/client/prefs.svelte';

	let { user, courses }: { user: App.SafeUser; courses: QACourse[] } = $props();
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
	<a class="brand" href="/">Life Tracker</a>
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
		<QuickAdd {courses} tz={user.timezone} />
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
					<a href="/settings/courses" onclick={() => (menu = false)}>Courses</a>
					<a href="/settings/goals" onclick={() => (menu = false)}>Goals</a>
					<form method="post" action="/logout"><button type="submit">Sign out</button></form>
				</div>
			{/if}
		</div>
	</div>
</header>
<svelte:window onclick={(e) => menu && !(e.target as HTMLElement).closest('.acct') && (menu = false)} />

<style>
	.hdr {
		min-height: 64px;
		padding: 12px 24px;
		background: var(--card);
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 24px;
		flex-wrap: wrap;
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand {
		font-size: 16px;
		font-weight: 700;
		color: var(--ink);
	}
	.brand:hover {
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav a {
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 13px;
		color: var(--quiet);
	}
	nav a.on {
		background: var(--rule);
		color: var(--ink);
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
		width: 36px;
		height: 36px;
		border-radius: 18px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}
	.theme:hover {
		background: var(--hover);
	}
	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 18px;
		border: 0;
		color: #fff;
		box-shadow: 0 0 0 1px var(--border);
		font-weight: 700;
		cursor: pointer;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 44px;
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: 12px;
		min-width: 200px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 24px var(--shadow);
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
		background: var(--rule);
		text-decoration: none;
	}
</style>
