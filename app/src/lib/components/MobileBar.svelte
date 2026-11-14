<!-- Phone bottom bar (FEATURES §10, D-21): Today · Week · + Add · Keep · More. Only under 700 px. -->
<script lang="ts">
	import { page } from '$app/state';
	import { openAdd } from '$lib/client/mobile.svelte';

	const TABS = [
		// icons = wireframe MBar
		{ href: '/today', label: 'Today', icon: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2' },
		{
			href: '/week',
			label: 'Week',
			icon: 'M5 4.5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM3 9.5h18M9 9.5v11M15 9.5v11',
		},
		null,
		{ href: '/keep', label: 'Keep', icon: 'M5 3h10l4 4v14H5zM9 12h6M9 16h4' },
		{ href: '/more', label: 'More', icon: 'M4 7h16M4 12h16M4 17h16' },
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
					stroke-linecap="round"
					stroke-linejoin="round"
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
			padding: 2px 0;
			min-height: 44px;
			justify-content: center;
		}
		a svg {
			box-sizing: content-box;
			padding: 5px 17px;
			border-radius: 999px;
		}
		a.on {
			font-weight: 700;
		}
		a.on svg {
			background: var(--pill-card);
			color: var(--pill-ink);
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
