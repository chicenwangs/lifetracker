<!-- FR-I5. Restore within 30 days, then purged. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { prettyDate } from '$lib/time';
	let { data, form } = $props();
</script>

<svelte:head><title>Trash · Life Tracker</title></svelte:head>

<main class="wrap">
	<div class="card panel">
		<h1>Trash</h1>
		<p class="hint">
			Deleted items (with their steps and time blocks) and planner blocks stay here 30 days, then are gone for
			good.
		</p>
		{#if form?.restored}<span class="ok-note"
				>Restored {form.restored} item{form.restored === 1 ? '' : 's'}.</span
			>{/if}
		{#each data.batches as b (b.batch)}
			<div class="r">
				<div>
					<b>{b.title}</b>
					<span class="muted"
						>{b.type ?? 'None'}{b.date ? ` · ${prettyDate(b.date)}` : ''}{b.count > 1
							? ` · +${b.count - 1} steps`
							: ''}</span
					>
				</div>
				<span class="hint">deleted {b.deletedAt?.slice(0, 10)}</span>
				<form method="post" action="?/restore" use:enhance>
					<input type="hidden" name="batch" value={b.batch} />
					<button class="btn sm" type="submit">Restore</button>
				</form>
			</div>
		{:else}
			<span class="muted">Trash is empty.</span>
		{/each}
	</div>
</main>

<style>
	.wrap {
		padding: 20px 24px;
		max-width: 900px;
		margin: 0 auto;
	}
	.panel {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h1 {
		font-size: 20px;
	}
	.r {
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--rule);
		padding: 8px 0;
	}
	.r > div {
		display: flex;
		flex-direction: column;
	}
</style>
