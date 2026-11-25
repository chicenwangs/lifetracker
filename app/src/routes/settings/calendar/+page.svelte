<!-- Settings › Calendar feed (v3.2 PR 7). A secret ICS link for Google/Apple Calendar. Shown once; Rotate kills the old link. -->
<script lang="ts">
	import { del, post } from '$lib/client/api';
	import { askConfirm } from '$lib/client/dialog.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';

	let { data } = $props();
	let on = $derived(data.feedOn);
	let url = $state<string | null>(null);
	let busy = $state(false);

	async function make(rotate: boolean) {
		if (rotate && !(await askConfirm('Make a new link? The old link stops working at once.', { ok: 'New link', danger: true }))) return; // prettier-ignore
		busy = true;
		try {
			url = (await post<{ url: string }>('/api/me/ics')).url;
			on = true;
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}
	async function off() {
		if (!(await askConfirm('Turn off the feed? Calendars using the link stop updating.', { ok: 'Turn off', danger: true }))) return; // prettier-ignore
		busy = true;
		try {
			await del('/api/me/ics');
			on = false;
			url = null;
			showToast('Calendar feed is off');
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(url ?? '');
			showToast('Link copied');
		} catch {
			showToast('Copy failed. Select the link and copy it.');
		}
	}
</script>

<svelte:head><title>Calendar feed · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Calendar feed</h1>
	<p class="hint">
		A private link that shows your own items in Google Calendar, Apple Calendar or Outlook (read-only, updates
		every few hours). Private items show as "Busy". Planner blocks and shared calendars are not included.
		Anyone with the link can see your plan, so keep it to yourself.
	</p>
	{#if url}
		<p class="ok-note">Copy it now. It is shown only once.</p>
		<input
			class="feed"
			type="text"
			readonly
			value={url}
			aria-label="Feed link"
			onfocus={(e) => e.currentTarget.select()}
		/>
	{/if}
	<div class="row acts">
		{#if !on}
			<button class="btn primary" type="button" disabled={busy} onclick={() => make(false)}
				>Create feed link</button
			>
		{:else}
			{#if url}<button class="btn primary" type="button" onclick={copy}>Copy</button>{/if}
			<button class="btn" type="button" disabled={busy} onclick={() => make(true)}>Rotate</button>
			<button class="btn danger" type="button" disabled={busy} onclick={off}>Turn off</button>
		{/if}
	</div>
	{#if on && !url}<p class="hint">The feed is on. Lost the link? Rotate makes a new one.</p>{/if}
</section>

<style>
	.feed {
		width: 100%;
		font-family: ui-monospace, monospace;
		font-size: 13px;
		margin: 8px 0;
	}
	.acts {
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.acts .btn,
		.feed {
			min-height: 48px;
		}
	}
</style>
