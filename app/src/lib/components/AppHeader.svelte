<!-- FR-H15. Nav shows only built pages. -->
<script lang="ts">
	import { backCloses } from '$lib/client/layers';
	import { SECTIONS } from '$lib/settings-sections';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import QuickAdd from './QuickAdd.svelte';
	import AppIcon from './AppIcon.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import AccountSheet from './AccountSheet.svelte';
	import { isPhone } from '$lib/client/phone';
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
	let acct = $state(false); // phone: account sheet instead of the dropdown (#88)

	// phone top bar (#89): tab screens = mark · search · avatar; deeper screens = Back + title (+ the same 2 actions)
	const TAB_ROOTS = ['/', '/today', '/week', '/month', '/keep', '/pages']; // month = the Calendar tab's other view (#95)
	const path = $derived(page.url.pathname);
	const scope = $derived(page.url.searchParams.get('scope'));
	const deep = $derived(!(TAB_ROOTS.includes(path) && !scope));
	const title = $derived.by(() => {
		if (path.startsWith('/settings')) return SECTIONS.find((x) => x.href === path)?.label ?? 'Settings';
		if (path === '/keep')
			return scope === 'archive' ? 'Keep archive' : scope === 'shared' ? 'Shared notes' : 'Keep';
		if (path === '/pages/shared') return 'Shared with me';
		if (path === '/pages/archive') return 'Archive';
		if (path === '/pages/trash') return 'Pages trash';
		if (path === '/pages/graph') return 'Graph';
		if (path.startsWith('/pages/'))
			return (page.data.page as { title?: string } | undefined)?.title || 'Untitled';
		if (path === '/trash') return 'Trash';
		if (path === '/month') return 'Month';
		if (path.startsWith('/item/')) return 'Item';
		if (path === '/more') return 'More';
		return '';
	});
	const parent = $derived(
		path.startsWith('/settings/')
			? '/settings'
			: path.startsWith('/pages/')
				? '/pages'
				: path === '/keep'
					? '/keep'
					: path === '/month'
						? '/week'
						: '/today',
	);
	// Back = system Back while there is in-app history; opened straight from a link / widget: go to the parent tab
	let inApp = false;
	afterNavigate((n) => {
		if (n.from) inApp = true;
	});
	const back = () => (inApp ? history.back() : goto(parent));
	let phone = $state(false); // no key hints in tooltips on phone (#115); after mount so hydration agrees
	afterNavigate(() => (phone = isPhone()));
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

<header class="hdr" class:deep>
	<a class="mark" href="/" aria-label="Life Tracker home"><AppIcon size={30} label="" /></a>
	{#if deep}
		<button class="pback" type="button" aria-label="Back" onclick={back}>
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg
			>
		</button>
		<span class="ptitle">{title}</span>
	{/if}
	<nav aria-label="Main">
		{#each NAV as n (n.href)}
			<a
				href={n.href}
				class:on={n.match(page.url.pathname)}
				aria-current={n.match(page.url.pathname) ? 'page' : undefined}>{n.label}</a
			>
		{/each}
		<!-- pinned pages: no icon, a faint | before each (owner 2026-11-16) -->
		{#each page.data.pins ?? [] as p (p.id)}
			<span class="sep" aria-hidden="true">|</span>
			<a
				href="/pages/{p.id}"
				class="pin"
				class:on={page.url.pathname === `/pages/${p.id}`}
				title="Pinned page">{p.title || 'Untitled'}</a
			>
		{/each}
	</nav>
	<div class="right">
		<button
			class="search"
			type="button"
			aria-label="Search"
			title={phone ? undefined : 'Search  Ctrl+K'}
			onclick={() => cmdk?.show()}
			><svg
				class="sicon"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg
			><span class="stext">Search</span> <kbd>{mod}+K</kbd></button
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
			class="theme mode"
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
				aria-expanded={menu || acct}
				style:background={user.color}
				onclick={() => (isPhone() ? (acct = true) : (menu = !menu))}
				>{user.displayName.slice(0, 1).toUpperCase()}</button
			>
			{#if menu}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					use:backCloses={() => (menu = false)}
					class="menu"
					onkeydown={(e) => e.key === 'Escape' && (menu = false)}
				>
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
{#if acct}<AccountSheet {user} onclose={() => (acct = false)} />{/if}
{#if help}
	<div class="scrim" role="presentation" onclick={() => (help = false)}></div>
	<div
		use:backCloses={() => (help = false)}
		class="sheet card"
		role="dialog"
		aria-modal="true"
		aria-labelledby="keys-h"
	>
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
	nav .sep {
		color: var(--quiet);
		opacity: 0.35;
		user-select: none;
	}
	nav a.pin {
		display: inline-block;
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		opacity: 0.9;
	}
	.pback,
	.ptitle,
	.sicon {
		display: none;
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
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
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
		/* top app bar (#89): 48 dp actions, Back + title on deeper screens, no desktop header */
		.deep .mark {
			display: none;
		}
		.pback {
			display: grid;
			place-items: center;
			width: 48px;
			height: 48px;
			margin-left: -8px;
			border: 0;
			border-radius: 50%;
			background: transparent;
			color: var(--ink);
			cursor: pointer;
			flex: none;
		}
		.pback:active {
			background: var(--rule);
		}
		.ptitle {
			display: block;
			font-size: 18px;
			font-weight: 700;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			min-width: 0;
			flex: 1 1 auto;
		}
		.deep .right {
			flex: none;
		}
		.search {
			width: 48px;
			height: 48px;
			padding: 0;
			justify-content: center;
			border-radius: 50%;
		}
		.sicon {
			display: block;
		}
		.avatar {
			width: 48px;
			height: 48px;
			border-radius: 24px;
		}
		.mark {
			display: grid;
			place-items: center;
			width: 48px;
			height: 48px;
			margin-left: -9px;
		}
		.stext,
		.search kbd,
		.mode, /* theme lives in Settings on phone (#88) */
		.right > [aria-label='Keyboard shortcuts'] {
			display: none; /* no keyboard on a phone */
		}
	}
</style>
