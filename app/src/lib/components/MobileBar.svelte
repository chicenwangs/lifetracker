<!-- Phone bottom bar (#88, G1): Today · Calendar · + · Keep · Pages. Only under 700 px. Account lives in the
     avatar sheet (AccountSheet). A screen outside the tabs (Settings, Trash, an item) keeps the last tab lit. -->
<script lang="ts">
	import { page } from '$app/state';
	import { openAdd } from '$lib/client/mobile.svelte';

	const TABS = [
		// icons = wireframe MBar
		{
			href: '/today',
			label: 'Today',
			icon: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
			match: (p: string) => p.startsWith('/today'),
		},
		{
			href: '/week',
			label: 'Calendar',
			icon: 'M5 4.5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM3 9.5h18M9 9.5v11M15 9.5v11',
			match: (p: string) => p.startsWith('/week') || p.startsWith('/month'),
		},
		null,
		{
			href: '/keep',
			label: 'Keep',
			icon: 'M5 3h10l4 4v14H5zM9 12h6M9 16h4',
			match: (p: string) => p.startsWith('/keep'),
		},
		{
			href: '/pages',
			label: 'Pages',
			icon: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h7M8 12h7M8 16h4',
			match: (p: string) => p.startsWith('/pages'),
		},
	];
	let last = $state('/today');
	const current = $derived(TABS.find((t) => t?.match(page.url.pathname))?.href);
	$effect(() => {
		if (current) last = current;
	});
	const on = (href: string) => (current ?? last) === href;
</script>

<nav class="mbar" aria-label="Phone navigation">
	{#each TABS as t, i (i)}
		{#if t}
			<a href={t.href} class:on={on(t.href)} aria-current={on(t.href) ? 'page' : undefined}>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill={on(t.href) ? 'currentColor' : 'none'}
					fill-opacity="0.25"
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
			padding: 4px 8px calc(4px + env(safe-area-inset-bottom));
			background: var(--card);
			border-top: 1.5px solid var(--border);
		}
		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			font-size: 12px;
			color: var(--ink);
			text-decoration: none;
			padding: 2px 0;
			min-height: 56px;
			justify-content: center;
		}
		a svg {
			box-sizing: content-box;
			padding: 4px 16px;
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
			transition:
				transform var(--t-fast) var(--ease),
				box-shadow var(--t-fast) var(--ease);
		}
		/* press: squash into the shadow (anticipation), spring back on release */
		.add:active {
			transform: translate(-2px, 2px) scale(0.92);
			box-shadow: 0 0 0 var(--accent);
		}
	}
</style>
