<!-- Phone "More" (FEATURES §10, wireframe MMore): everything not in the bottom bar. Pinned pages · Browse · App. -->
<script lang="ts">
	let { data } = $props();
	// svelte-ignore state_referenced_locally
	const month = new Date().toLocaleString('en', { month: 'long', timeZone: data.user?.timezone });
	const BROWSE = [
		{ href: '/pages', label: 'All pages', value: '' },
		{ href: '/pages/shared', label: 'Shared with me', value: '' },
		{ href: '/week', label: 'Week', value: '' },
		{ href: '/month', label: 'Month', value: month },
		{ href: '/keep?scope=archive', label: 'Keep archive', value: '' },
		{ href: '/trash', label: 'Trash', value: '30 days' },
	];
	const APP = [
		{ href: '/settings/preferences', label: 'Settings', value: '' },
		{ href: '/settings/help', label: 'Help + tour', value: '' },
	];
</script>

<svelte:head><title>More · Life Tracker</title></svelte:head>

{#snippet rows(list: { href: string; label: string; value: string }[])}
	<div class="list card">
		{#each list as l (l.href)}
			<a href={l.href}>{l.label}<span class="s">{l.value} ›</span></a>
		{/each}
	</div>
{/snippet}

<main class="more">
	<h1>More</h1>
	<nav aria-label="More">
		{#if data.pins?.length}
			<p class="lbl">PINNED PAGES</p>
			{@render rows(
				data.pins.map((p) => ({ href: `/pages/${p.id}`, label: p.title || 'Untitled', value: '' })),
			)}
		{/if}
		<p class="lbl">BROWSE</p>
		{@render rows(BROWSE)}
		<p class="lbl">APP</p>
		{@render rows(APP)}
	</nav>
	<p class="hint">Signed in as {data.user?.displayName} (@{data.user?.username})</p>
	<form method="post" action="/logout"><button class="btn" type="submit">Sign out</button></form>
</main>

<style>
	.more {
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 12px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.lbl {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--quiet);
		margin: 16px 4px 8px;
	}
	.lbl:first-child {
		margin-top: 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		padding: 0;
		overflow: hidden;
	}
	a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 14px;
		min-height: 52px;
		color: var(--ink);
		font-size: 15px;
		font-weight: 500;
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}
	a:last-child {
		border-bottom: 0;
	}
	.s {
		margin-left: auto;
		font-size: 13px;
		color: var(--quiet);
	}
</style>
