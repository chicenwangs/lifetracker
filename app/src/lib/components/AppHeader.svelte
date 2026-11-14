<!-- FR-H15. Nav shows only built pages. -->
<script lang="ts">
	import { page } from '$app/state';
	import QuickAdd from './QuickAdd.svelte';
	import AppIcon from './AppIcon.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import { initTheme, setTheme, themeState } from '$lib/client/prefs.svelte';

	let { user }: { user: App.SafeUser } = $props();
	const NAV = [
		{ href: '/', label: 'Home', match: (p: string) => p === '/' },
		{ href: '/week', label: 'Week', match: (p: string) => p.startsWith('/week') },
		{ href: '/keep', label: 'Keep', match: (p: string) => p.startsWith('/keep') },
		{
			href: '/pages',
			label: 'Pages',
			match: (p: string) => p === '/pages' || p.startsWith('/pages/archive') || p.startsWith('/pages/trash'),
		},
	];
	let menu = $state(false);
	let help = $state(false);
	let cmdk: CommandPalette | undefined = $state();
	const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
	const KEYS = $derived([
		[`${mod}+K`, 'Search pages, notes, planner; jump anywhere'],
		['N', 'Quick add'],
		[`${mod}+Z`, 'Undo your last change (outside text fields)'],
		['Alt + drag', 'Copy an item or block instead of moving it'],
		['/', 'In quick add: pick a type or where it goes'],
		['↑ ↓ on a block', 'Move 15 min (Shift: change the end)'],
		['Enter on a block', 'Rename, set start / end, delete'],
		['Esc', 'Close a dialog or menu'],
		['?', 'This list'],
	]);
	const typingIn = (t: EventTarget | null) =>
		t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
	// svelte-ignore state_referenced_locally
	initTheme(user);
	const dark = $derived(themeState.value === 'dark');
	const auto = $derived(themeState.mode === 'auto');
	const themeTip = $derived(
		auto
			? `Auto: ${dark ? `dark until ${themeState.light}` : `light until ${themeState.dark}`}. Click for ${dark ? 'light' : 'dark'}.`
			: `${dark ? 'Dark' : 'Light'} (fixed). Click for ${dark ? 'light' : 'dark'}.`,
	);
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
		{#each page.data.pins ?? [] as p (p.id)}
			<a
				href="/pages/{p.id}"
				class="pin"
				class:on={page.url.pathname === `/pages/${p.id}`}
				title="Pinned page"
				><svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /></svg
				>{p.title || 'Untitled'}</a
			>
		{/each}
	</nav>
	<div class="right">
		<button
			class="search"
			type="button"
			aria-label="Search (Ctrl+K)"
			title="Search  Ctrl+K"
			onclick={() => cmdk?.show()}>Search <kbd>{mod}+K</kbd></button
		>
		<QuickAdd tz={user.timezone} />
		<button
			class="theme"
			type="button"
			aria-label="Keyboard shortcuts"
			title="Shortcuts  ?"
			aria-expanded={help}
			onclick={() => (help = !help)}>?</button
		>
		<button
			class="theme"
			type="button"
			aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
			title={themeTip}
			aria-pressed={dark}
			class:auto
			onclick={() => setTheme(dark ? 'light' : 'dark')}
		>
			{#if auto}
				<!-- half circle = Auto (UX-AUDIT #18) -->
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
					><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></svg
				>
			{:else if dark}
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
					<a href="/settings/types" onclick={() => (menu = false)}>Item types</a>
					<a href="/settings/sessions" onclick={() => (menu = false)}>Devices</a>
					<a href="/settings/sharing" onclick={() => (menu = false)}>Sharing</a>
					{#if user.role === 'admin'}<a href="/settings/users" onclick={() => (menu = false)}>Users</a>{/if}
					<form method="post" action="/logout"><button type="submit">Sign out</button></form>
				</div>
			{/if}
		</div>
	</div>
</header>
<CommandPalette bind:this={cmdk} />
{#if help}
	<div class="scrim" role="presentation" onclick={() => (help = false)}></div>
	<div class="sheet card" role="dialog" aria-modal="true" aria-labelledby="keys-h">
		<h2 id="keys-h">Shortcuts</h2>
		<dl>
			{#each KEYS as [k, v] (k)}<dt><kbd>{k}</kbd></dt>
				<dd>{v}</dd>{/each}
		</dl>
		<p class="hint">Every drag also has a button: Schedule… on due items, Start / End in a block's menu.</p>
		<button class="btn sm" type="button" onclick={() => (help = false)}>Close</button>
	</div>
{/if}
<svelte:window
	onclick={(e) => menu && !(e.target as HTMLElement).closest('.acct') && (menu = false)}
	onkeydown={(e) => {
		if (e.key === 'Escape' && help) help = false;
		else if (e.key === '?' && !typingIn(e.target) && !e.ctrlKey && !e.metaKey) help = !help;
	}}
/>

<style>
	nav a.pin {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		opacity: 0.9;
	}
	.search {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.search kbd {
		font: inherit;
		font-size: 11px;
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0 4px;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgb(0 0 0 / 0.3);
	}
	.sheet {
		position: fixed;
		top: 12vh;
		left: 50%;
		translate: -50% 0;
		z-index: 91;
		width: min(440px, 92vw);
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.sheet dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 14px;
		margin: 0;
		font-size: 13px;
	}
	.sheet dd {
		margin: 0;
	}
	.sheet kbd {
		font: inherit;
		font-size: 12px;
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 1px 6px;
	}
	.sheet .btn {
		align-self: flex-end;
	}
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
	/* phone: the bottom bar has nav + Add (FEATURES §10) */
	@media (max-width: 699px) {
		nav,
		.right > :global(.opener) {
			display: none;
		}
		/* phone: one row (mark left, search · theme · avatar right), scrolls away with the page */
		.hdr {
			padding: 8px 12px;
			min-height: 52px;
			flex-wrap: nowrap;
			gap: 8px;
			position: relative; /* not static: keeps z-index 20, else the account menu opens under the page */
		}
		.hdr::before {
			display: none;
		}
		.right {
			flex: 1 1 auto;
			min-width: 0;
			gap: 8px;
		}
		.search kbd,
		.right > [aria-label='Keyboard shortcuts'] {
			display: none; /* no keyboard on a phone */
		}
	}
</style>
