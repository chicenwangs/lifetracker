<!-- Phone Settings home (#100): grouped rows, icon + current value; tap = the section (top bar Back returns). -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isPhone } from '$lib/client/phone';
	import { onMount } from 'svelte';
	import { SECTIONS } from '$lib/settings-sections';

	onMount(() => {
		if (!isPhone()) void goto('/settings/account', { replaceState: true });
	});
	const user = $derived(page.data.user);
	const value: Record<string, string | undefined> = $derived({
		'/settings/account': user ? `@${user.username}` : undefined,
		'/settings/preferences': user?.timezone,
	});
	const rows = $derived(SECTIONS.filter((s) => !s.admin || user?.role === 'admin'));
	const groups = $derived([...new Set(rows.map((r) => r.group))]);
</script>

<svelte:head><title>Settings · Life Tracker</title></svelte:head>

<div class="list">
	{#each groups as g, gi (g)}
		<section aria-labelledby="sg-{gi}">
			<h2 id="sg-{gi}">{g}</h2>
			<ul class="card">
				{#each rows.filter((r) => r.group === g) as r (r.href)}
					<li>
						<a href={r.href}>
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><path d={r.icon} /></svg
							>
							<span class="l">{r.label}</span>
							{#if value[r.href]}<span class="v">{value[r.href]}</span>{/if}
							<span class="chev" aria-hidden="true">›</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		margin: 0 4px 6px;
		font-size: 12px !important;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--quiet);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 4px 0;
	}
	li + li {
		border-top: 1px solid var(--rule);
	}
	a {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 56px;
		padding: 0 14px;
		color: var(--ink);
		text-decoration: none;
	}
	.l {
		flex: 1;
		font-size: 15px;
		font-weight: 600;
	}
	.v {
		font-size: 13px;
		color: var(--quiet);
		max-width: 45%;
		min-width: 0;
		text-align: right;
		overflow-wrap: anywhere; /* big system text: wrap, never run off (#116) */
	}
	.chev {
		color: var(--quiet);
		font-size: 20px;
	}
</style>
