<!-- Phone "More" (FEATURES §10): everything not in the bottom bar. Week/Month are read-first on a phone. -->
<script lang="ts">
	let { data } = $props();
	const LINKS = [
		{ href: '/?m=', label: 'Month', hint: 'Compact month; tap a day for its planner' },
		{ href: '/week', label: 'Week', hint: 'Read-first on a phone' },
		{ href: '/keep?scope=archive', label: 'Keep archive', hint: '' },
		{ href: '/trash', label: 'Planner trash', hint: 'Deleted items and blocks, 30 days' },
		{
			href: '/settings/preferences',
			label: 'Settings',
			hint: 'Theme, timezone, planner defaults, types, sharing',
		},
	];
</script>

<svelte:head><title>More · Life Tracker</title></svelte:head>

<main class="more">
	<h1>More</h1>
	<nav class="card" aria-label="More">
		{#each LINKS as l (l.href)}
			<a href={l.href === '/?m=' ? '/?desktop=1' : l.href}
				><b>{l.label}</b>{#if l.hint}<span class="hint">{l.hint}</span>{/if}</a
			>
		{/each}
	</nav>
	<p class="hint">Signed in as {data.user?.displayName} (@{data.user?.username})</p>
	<form method="post" action="/logout"><button class="btn" type="submit">Sign out</button></form>
</main>

<style>
	.more {
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 12px 104px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	nav {
		display: flex;
		flex-direction: column;
	}
	a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 16px;
		min-height: 48px;
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}
	a:last-child {
		border-bottom: 0;
	}
</style>
