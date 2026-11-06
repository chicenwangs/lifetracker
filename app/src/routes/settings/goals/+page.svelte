<!-- FR-G1. Goals per quarter. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const shift = (p: string, d: number) => {
		let y = Number(p.slice(0, 4));
		let q = Number(p.slice(6)) + d;
		if (q < 1) [y, q] = [y - 1, 4];
		if (q > 4) [y, q] = [y + 1, 1];
		return `${y}-Q${q}`;
	};
	const keep =
		() =>
		async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });
</script>

<svelte:head><title>Goals · Life Tracker</title></svelte:head>

<div class="card panel">
	<div class="row" style="justify-content: space-between">
		<h1>Goals · {data.period}</h1>
		<div class="row">
			<a class="btn sm" href="?q={shift(data.period, -1)}">← {shift(data.period, -1)}</a>
			{#if data.period !== data.current}<a class="btn sm" href="?q={data.current}">Current</a>{/if}
			<a class="btn sm" href="?q={shift(data.period, 1)}">{shift(data.period, 1)} →</a>
		</div>
	</div>
	{#if form?.message}<span class="alert">{form.message}</span>{/if}
	{#each data.goals as g, i (g.id)}
		<form class="grow" method="post" action="?/save" use:enhance={keep}>
			<input type="hidden" name="id" value={g.id} />
			<input type="hidden" name="period" value={data.period} />
			<label class="sr-only" for="d-{g.id}">Done</label>
			<input
				id="d-{g.id}"
				type="checkbox"
				name="done"
				checked={g.done}
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
			/>
			<label class="sr-only" for="t-{g.id}">Goal</label>
			<input id="t-{g.id}" class="input sm" name="text" value={g.text} required maxlength="300" />
			<button class="btn sm" type="submit">Save</button>
			<button
				class="btn sm ghost"
				type="submit"
				formaction="?/move"
				name="dir"
				value="up"
				disabled={i === 0}
				aria-label="Move up">↑</button
			>
			<button
				class="btn sm ghost"
				type="submit"
				formaction="?/move"
				name="dir"
				value="down"
				disabled={i === data.goals.length - 1}
				aria-label="Move down">↓</button
			>
			<button
				class="btn sm danger"
				type="submit"
				formaction="?/remove"
				onclick={(e) => !confirm('Delete goal?') && e.preventDefault()}>Delete</button
			>
		</form>
	{:else}
		<span class="muted">No goals for {data.period}.</span>
	{/each}
	<form class="grow" method="post" action="?/add" use:enhance>
		<input type="hidden" name="period" value={data.period} />
		<label class="sr-only" for="ng">New goal</label>
		<input id="ng" class="input sm" name="text" placeholder="New goal" required maxlength="300" />
		<button class="btn sm primary" type="submit">Add</button>
	</form>
</div>

<style>
	.grow {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.grow .input {
		flex: 1;
		width: auto;
	}
	.grow input[type='checkbox'] {
		width: 18px;
		height: 18px;
	}
</style>
