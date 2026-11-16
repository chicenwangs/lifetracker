<!-- Phone "+ Add" bottom sheet (FEATURES §10): Plan it (same quick-add grammar + live slots) · Quick note (Keep). -->
<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { post } from '$lib/client/api';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { qaPrefs } from '$lib/client/itemtypes.svelte';
	import { addSheet } from '$lib/client/mobile.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { parseQuickAdd } from '$lib/quickadd';
	import { nowLocalMinutes, todayLocal } from '$lib/time';
	import CommandInput from './CommandInput.svelte';
	import QASlots from './QASlots.svelte';

	const tz = $derived(page.data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const ctx = $derived({
		today: todayLocal(tz),
		nowMinutes: nowLocalMinutes(tz),
		...qaPrefs(page.data.user),
	});
	const parsed = $derived(parseQuickAdd(addSheet.text, ctx));
	let busy = $state(false);
	let problem = $state('');
	let note = $state('');

	const close = () => {
		addSheet.open = false;
		problem = '';
	};
	async function plan() {
		if (busy) return;
		if (!parsed.ok) return void (problem = (parsed.problems[0] ?? '').replace(/`/g, ''));
		busy = true;
		try {
			await post('/api/quickadd', { text: addSheet.text });
			showToast(`Added "${parsed.title}"`);
			addSheet.text = ''; // batch add: sheet stays open
			problem = '';
			calendarChanged();
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}
	async function saveNote() {
		if (busy || !note.trim()) return;
		busy = true;
		try {
			await post('/api/keep/notes', { body: note });
			note = '';
			showToast('Note saved');
			close();
			await invalidateAll();
		} catch (e) {
			showError(e); // text stays in the box
		} finally {
			busy = false;
		}
	}
</script>

{#if addSheet.open}
	<div class="scrim" role="presentation" onclick={close}></div>
	<div class="sheet card" role="dialog" aria-modal="true" aria-label="Add">
		<div class="tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={addSheet.tab === 'plan'}
				onclick={() => (addSheet.tab = 'plan')}>Plan it</button
			>
			<button
				type="button"
				role="tab"
				aria-selected={addSheet.tab === 'note'}
				onclick={() => (addSheet.tab = 'note')}>Quick note</button
			>
		</div>
		{#if addSheet.tab === 'plan'}
			<CommandInput
				bind:value={addSheet.text}
				{ctx}
				autofocus
				label="What and when"
				onenter={plan}
				onescape={close}
				oninput={() => (problem = '')}
			/>
			<QASlots {parsed} />
			{#if problem}<p class="alert" role="alert">{problem}</p>{/if}
			<div class="row">
				<button class="btn" type="button" onclick={close}>Close</button>
				<button class="btn primary" type="button" disabled={busy || !addSheet.text.trim()} onclick={plan}
					>Add</button
				>
			</div>
		{:else}
			<!-- svelte-ignore a11y_autofocus -->
			<textarea bind:value={note} rows="5" placeholder="Note" aria-label="Note" maxlength="20000" autofocus
			></textarea>
			<div class="row">
				<button class="btn" type="button" onclick={close}>Close</button>
				<button class="btn primary" type="button" disabled={busy || !note.trim()} onclick={saveNote}
					>Save note</button
				>
			</div>
		{/if}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgb(0 0 0 / 0.35);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 81;
		border-radius: 16px 16px 0 0;
		padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 640px;
		margin: 0 auto;
		animation: lt-rise 200ms var(--ease) both;
	}
	.tabs {
		display: flex;
		gap: 6px;
	}
	.tabs button {
		flex: 1;
		min-height: 40px;
		border-radius: 999px;
		border: 1.5px solid var(--border);
		background: transparent;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		background: var(--pill);
		color: var(--pill-ink);
		font-weight: 600;
	}
	textarea {
		font: inherit;
		border-radius: 10px;
		border: 1.5px solid var(--border);
		padding: 10px;
		background: var(--card);
		color: var(--ink);
	}
	.row {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	.sheet :global(.iw.lg) {
		border: 1.5px solid var(--border);
		border-radius: 10px;
		background: var(--card);
	}
	.sheet :global(.slots) {
		padding: 0;
		border: 0;
	}
</style>
