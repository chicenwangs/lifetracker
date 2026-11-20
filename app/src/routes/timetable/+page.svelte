<!-- #263: a class timetable — the same calendar payload as Week, laid out as weekday columns over a term. -->
<script lang="ts">
	import { openItem } from '$lib/client/peek.svelte';
	import { colorsFor } from '$lib/colors';
	import { describeRRule } from '$lib/rrule';
	import { addDays, prettyDate } from '$lib/time';

	let { data } = $props();
	const days = $derived(data.weeks[0]?.days ?? []);
	const span = $derived(data.weeks.length * 7);
	const week = (n: number) => `/timetable?w=${addDays(data.from, 7 * n)}`;
	const jump = (d: string | null) => (d ? `/timetable?w=${d}#d-${d}` : null);
	const empty = $derived(!data.weeks.some((w) => w.days.some((d) => d.items.length)));
</script>

<svelte:head><title>Timetable · Life Tracker</title></svelte:head>

<main class="tt">
	<header>
		<div>
			<h1>Timetable</h1>
			<p class="hint">Your classes across a {span / 7}-week term. Tap any class to open it.</p>
		</div>
		<nav aria-label="Timetable periods">
			<a class="btn sm" href={week(-1)} aria-label="Previous week">‹</a>
			<a class="btn sm" href="/timetable?w={data.today}">This week</a>
			<a class="btn sm" href={week(1)} aria-label="Next week">›</a>
			{#if data.prevClass}<a class="btn sm" href={jump(data.prevClass)}>Previous class</a>{/if}
			{#if data.nextClass}<a class="btn sm" href={jump(data.nextClass)}>Next class</a>{/if}
		</nav>
	</header>

	{#if data.classes.length}
		<section class="card legend" aria-label="Recurring classes">
			<h2>Recurring classes</h2>
			<ul>
				{#each data.classes as c (c.seriesId ?? c.id)}
					<li>
						<button type="button" onclick={() => openItem(c.seriesId ?? c.id)}>{c.title}</button>
						<span>{describeRRule(c.rrule)}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div class="card board">
		<table>
			<thead>
				<tr>
					<th scope="col">Week</th>
					{#each days as d (d.date)}
						<th scope="col">{prettyDate(d.date).split(' ')[0]} <small>{Number(d.date.slice(8))}</small></th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.weeks as w (w.start)}
					<tr>
						<th scope="row">{Number(w.start.slice(8))}/{Number(w.start.slice(5, 7))}</th>
						{#each w.days as d (d.date)}
							<td id="d-{d.date}" class:today={d.date === data.today}>
								{#each d.items as it (it.id)}
									{@const c = colorsFor(it.type)}
									<button
										class="chip"
										style:background={c.bg}
										style:color={c.ink}
										type="button"
										title="{it.title} · {it.time ?? 'all day'}"
										aria-label="Open {it.title}, {it.time ?? 'all day'}"
										onclick={() => openItem(it.id)}
									>
										<b>{it.time ?? '—'}</b>
										<span>{it.title}</span>
									</button>
								{/each}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if empty}
		<p class="empty card">
			No classes in this term yet. Add one from quick add, like
			<code>Math every tue 09:00 until 2027-05-18</code>.
		</p>
	{/if}
</main>

<style>
	.tt {
		padding: 8px 24px 40px;
		max-width: 1800px;
		margin: 0 auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	h1 {
		margin: 0;
		font-size: 24px;
	}
	.hint {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--quiet);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.legend {
		padding: 12px 16px;
		margin-bottom: 12px;
	}
	.legend h2 {
		margin: 0 0 6px;
		font-size: 14px;
	}
	.legend ul {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.legend li {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 13px;
	}
	.legend button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
	.legend span {
		color: var(--quiet);
	}
	.board {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 980px;
		border-collapse: collapse;
		table-layout: fixed;
	}
	th,
	td {
		border: 1px solid var(--rule);
		padding: 4px;
		text-align: left;
		vertical-align: top;
	}
	thead th {
		background: var(--hover);
		font-size: 12px;
	}
	thead th small {
		color: var(--quiet);
		font-weight: 400;
	}
	tbody th {
		width: 60px;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	td {
		min-width: 120px;
	}
	td.today {
		background: var(--pill-card);
	}
	.chip {
		display: flex;
		flex-direction: column;
		gap: 1px;
		width: 100%;
		margin-bottom: 3px;
		padding: 3px 5px;
		border: 1px solid var(--ink);
		border-radius: 5px;
		font: inherit;
		font-size: 12px;
		line-height: 1.2;
		text-align: left;
		cursor: pointer;
	}
	.chip b {
		font-variant-numeric: tabular-nums;
	}
	.chip span {
		overflow-wrap: anywhere;
	}
	.empty {
		margin-top: 12px;
		padding: 16px;
		font-size: 14px;
	}
	code {
		padding: 1px 4px;
		border-radius: 4px;
		background: var(--pill);
		color: var(--pill-ink);
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.tt {
			padding: 8px 12px 24px;
		}
		h1 {
			font-size: 20px;
		}
		.chip {
			min-height: 48px; /* phone hit area (#223) */
		}
	}
</style>
