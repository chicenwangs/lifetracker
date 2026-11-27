<!-- Settings › Calendar feed (card 07, D-V4-25). The URL is shown once; Rotate and Turn off are the reversals.
     No undo toast: the journal never touches users (C13). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	let { data, form } = $props();

	type Action = 'create' | 'rotate' | 'off';
	let copied = $state(false);
	let failed = $state<{ action: Action; msg: string } | null>(null);

	const enhanceWith =
		(action: Action): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			copied = false;
			if (result.type === 'error') {
				failed = { action, msg: result.error.message || 'Something broke. Try again.' };
				return; // no update(): that would swap in the error page
			}
			failed =
				result.type === 'failure'
					? { action, msg: String((result.data as { msg?: string } | undefined)?.msg ?? 'Try again.') }
					: null;
			await update({ reset: false });
		};

	function copy(url?: string) {
		if (!url) return;
		navigator.clipboard?.writeText(url).catch(() => {});
		copied = true;
	}
</script>

<svelte:head><title>Calendar feed · Life Tracker</title></svelte:head>

<div class="stack">
	<section class="card panel">
		<h1>Calendar feed</h1>
		<p class="muted">
			A read-only link to your plan. Add it in Google Calendar ("From URL") or Apple Calendar ("New Calendar
			Subscription"). Private items show as Busy. The link reads your own items only, from 30 days ago to a
			year ahead.
		</p>

		{#if failed || form?.msg}
			<p class="alert" role="alert">{failed?.msg ?? form?.msg}</p>
			<button class="btn" type="submit" form={`feed-${failed?.action ?? 'create'}`}>Retry</button>
		{/if}

		{#if form?.url}
			<div class="feed" role="status">
				<code aria-label="Your calendar feed link">{form.url}</code>
				<button class="btn" type="button" onclick={() => copy(form?.url)}>{copied ? 'Copied' : 'Copy'}</button
				>
				<form id="feed-rotate" method="post" action="?/rotate" use:enhance={enhanceWith('rotate')}>
					<button class="btn" type="submit">Rotate</button>
				</form>
				<form id="feed-off" method="post" action="?/off" use:enhance={enhanceWith('off')}>
					<button class="btn danger" type="submit">Turn off</button>
				</form>
			</div>
			<p class="hint">Shown once. Copy it now; a reload only says that a feed exists.</p>
		{:else if data.exists}
			<p>Feed is on. Anyone with the link can read your items.</p>
			<div class="row">
				<form id="feed-rotate" method="post" action="?/rotate" use:enhance={enhanceWith('rotate')}>
					<button class="btn" type="submit">Rotate</button>
				</form>
				<form id="feed-off" method="post" action="?/off" use:enhance={enhanceWith('off')}>
					<button class="btn danger" type="submit">Turn off</button>
				</form>
			</div>
			<p class="hint">Rotate makes a new link and the old one stops working.</p>
		{:else}
			<p>No feed yet. Create a link to see your plan in another calendar.</p>
			<form id="feed-create" method="post" action="?/create" use:enhance={enhanceWith('create')}>
				<button class="btn primary" type="submit">Create feed link</button>
			</form>
		{/if}
	</section>
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.feed {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 12px;
		border: 1.5px dashed var(--ink);
		border-radius: 10px;
	}
	.feed code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.feed form {
		display: flex;
	}
	.row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
