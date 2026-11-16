<!-- Calendar tab on phone (#95): one tab, Week | Month switch. Links, so each view keeps its own URL. -->
<script lang="ts">
	let { on, week, month }: { on: 'week' | 'month'; week: string; month: string } = $props();
</script>

<nav class="cs" aria-label="Calendar view">
	<a href={week} class:on={on === 'week'} aria-current={on === 'week' ? 'page' : undefined}>Week</a>
	<a href={month} class:on={on === 'month'} aria-current={on === 'month' ? 'page' : undefined}>Month</a>
</nav>

<style>
	.cs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 4px;
		gap: 4px;
		border-radius: 999px;
		border: 1.5px solid var(--border);
		background: var(--card);
	}
	a {
		display: grid;
		place-items: center;
		min-height: 48px;
		border-radius: 999px;
		color: var(--ink);
		font-weight: 600;
		text-decoration: none;
	}
	a.on {
		background: var(--pill-card);
		color: var(--pill-ink);
	}
</style>
