<!-- Pages Trash (D-18): restore within 30 days, then gone. -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	let { data } = $props();
	async function restore(batch: string) {
		try {
			await post(`/api/pages/trash/${batch}/restore`);
			await invalidateAll();
			showToast('Restored');
		} catch (e) {
			showError(e);
		}
	}
</script>

<svelte:head><title>Pages trash · Life Tracker</title></svelte:head>

<div class="card panel">
	<h1>Trash</h1>
	<p class="muted">
		Deleted pages stay here for 30 days, then they are gone for good. Archive is the place for old pages you
		want to keep.
	</p>
	{#each data.trashed as t (t.batch)}
		<div class="row">
			<span
				><b>{t.title || 'Untitled'}</b>{#if t.count > 1}
					<span class="hint">+ {t.count - 1} subpages</span>{/if}</span
			>
			<span class="hint">{new Date(t.deletedAt).toLocaleDateString()}</span>
			<button class="btn sm" type="button" onclick={() => restore(t.batch)}>Restore</button>
		</div>
	{:else}<p class="hint">Trash is empty.</p>{/each}
</div>

<style>
	.row {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 8px 0;
		border-top: 1px solid var(--rule);
	}
	.row > span:first-child {
		flex: 1;
	}
</style>
