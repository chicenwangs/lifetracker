<!-- FR-H14. Collapsed. Tick toggles. Edit in Settings > Goals. -->
<script lang="ts">
	import { patch } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';
	import type { GoalDTO } from '$lib/types';

	let { goals: initial, period }: { goals: GoalDTO[]; period: string } = $props();
	let goals = $state<GoalDTO[]>([]);
	$effect(() => {
		goals = initial.map((g) => ({ ...g }));
	});
	const done = $derived(goals.filter((g) => g.done).length);
	const q = $derived(period.split('-')[1] ?? '');

	async function toggle(g: GoalDTO) {
		const want = !g.done;
		g.done = want;
		try {
			await patch(`/api/goals/${g.id}`, { done: want });
		} catch (e) {
			g.done = !want;
			showError(e);
		}
	}
</script>

<details class="card goals">
	<summary>{q} goals · {done} of {goals.length}</summary>
	<div class="list">
		{#each goals as g (g.id)}
			<label
				><input type="checkbox" checked={g.done} onchange={() => toggle(g)} /><span class:d={g.done}
					>{g.text}</span
				></label
			>
		{:else}
			<span class="muted">No goals for {period} yet.</span>
		{/each}
		<a class="edit" href="/settings/goals">Edit goals</a>
	</div>
</details>

<style>
	.goals {
		padding: 12px 16px;
	}
	summary {
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 10px;
		font-size: 13px;
	}
	label {
		display: flex;
		gap: 8px;
		align-items: center;
		cursor: pointer;
	}
	input {
		margin: 0;
		width: 16px;
		height: 16px;
	}
	.d {
		text-decoration: line-through;
	}
	.edit {
		font-size: 12px;
		margin-top: 4px;
	}
</style>
