<!-- Phone account sheet (#88): opened from the avatar. Everything the old More tab had that isn't a tab now. -->
<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';

	let { user, onclose }: { user: App.SafeUser; onclose: () => void } = $props();
	const LINKS = [
		{ href: '/settings', label: 'Settings' },
		{ href: '/pages/shared', label: 'Shared with me' },
		{ href: '/keep?scope=archive', label: 'Keep archive' },
		{ href: '/trash', label: 'Trash' },
		{ href: '/settings/help', label: 'Help + tour' },
	];
</script>

<BottomSheet label="Account" {onclose}>
	<div class="who">
		<span class="av" style:background={user.color} aria-hidden="true"
			>{user.displayName.slice(0, 1).toUpperCase()}</span
		>
		<div><b>{user.displayName}</b><span class="muted">@{user.username}</span></div>
	</div>
	<nav aria-label="Account">
		{#each LINKS as l (l.href)}
			<a href={l.href} onclick={onclose}>{l.label}<span aria-hidden="true">›</span></a>
		{/each}
	</nav>
	<form method="post" action="/logout"><button class="out" type="submit">Sign out</button></form>
</BottomSheet>

<style>
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 4px 8px;
	}
	.who b {
		display: block;
	}
	.muted {
		color: var(--quiet);
		font-size: 13px;
	}
	.av {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: #fff;
		font-weight: 700;
		border: 1.5px solid var(--border);
	}
	nav {
		display: flex;
		flex-direction: column;
	}
	a,
	.out {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 52px;
		padding: 0 4px;
		color: var(--ink);
		font-size: 16px;
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}
	a span {
		color: var(--quiet);
	}
	.out {
		width: 100%;
		border: 0;
		background: none;
		font: inherit;
		font-size: 16px;
		color: var(--danger, #c0392b);
		cursor: pointer;
	}
</style>
