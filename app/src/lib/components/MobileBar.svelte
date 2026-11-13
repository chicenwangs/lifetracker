<!-- Phone bottom bar (FEATURES §10, D-21): Today · Week · + Add · Keep · More. Only under 700 px. -->
<script lang="ts">
	import { page } from '$app/state';
	import { openAdd } from '$lib/client/mobile.svelte';

	const TABS = [
		{ href: '/today', label: 'Today', icon: 'M4 6h16M4 12h10M4 18h7' },
		{ href: '/week', label: 'Week', icon: 'M4 5h16v15H4zM4 10h16M9 5v15' },
		null,
		{ href: '/keep', label: 'Keep', icon: 'M6 3h12v18l-6-4-6 4z' },
		{ href: '/more', label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
	];
	const on = (href: string) => page.url.pathname.startsWith(href);
</script>

<nav class="mbar" aria-label="Phone navigation">
	{#each TABS as t, i (i)}
		{#if t}
			<a href={t.href} class:on={on(t.href)} aria-current={on(t.href) ? 'page' : undefined}>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d={t.icon} /></svg
				>
				<span>{t.label}</span>
			</a>
		{:else}
			<button class="add" type="button" aria-label="Add" onclick={() => openAdd()}>+</button>
		{/if}
	{/each}
</nav>

<style>
	.mbar {
		display: none;
	}
	@media (max-width: 699px) {
		.mbar {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 50;
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			align-items: center;
			padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
			background: var(--card);
			border-top: 1.5px solid var(--border);
		}
		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			font-size: 11px;
			color: var(--ink);
			text-decoration: none;
			padding: 4px 0;
			border-radius: 999px;
			min-height: 44px;
			justify-content: center;
		}
		a.on {
			background: var(--pill);
			font-weight: 600;
		}
		.add {
			justify-self: center;
			width: 56px;
			height: 56px;
			margin-top: -22px;
			border-radius: 50%;
			border: 1.5px solid var(--border);
			background: var(--accent);
			color: #00003d;
			font-size: 28px;
			box-shadow: var(--shadow-btn);
			cursor: pointer;
		}
	}
</style>
