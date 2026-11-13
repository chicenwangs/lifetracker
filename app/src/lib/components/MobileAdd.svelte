<!-- Phone "+ Add" bottom sheet (FEATURES §10): Plan it (same quick-add grammar + preview) · Quick note (Keep).
     Opened for a "No time set" item it just asks for a time instead. -->
<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { patch, post } from '$lib/client/api';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { qaPrefs } from '$lib/client/itemtypes.svelte';
	import { addSheet } from '$lib/client/mobile.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { parseQuickAdd } from '$lib/quickadd';
	import { nowLocalMinutes, prettyDate, todayLocal } from '$lib/time';
	import CommandInput from './CommandInput.svelte';

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
	let time = $state('');

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
	async function giveTime() {
		if (busy || !addSheet.itemId || !time) return;
		busy = true;
		try {
			await patch(`/api/items/${addSheet.itemId}`, { time });
			showToast(`"${addSheet.title}" at ${time}`);
			close();
			calendarChanged();
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if addSheet.open}
	<div class="scrim" role="presentation" onclick={close}></div>
	<div
		class="sheet card"
		role="dialog"
		aria-modal="true"
		aria-label={addSheet.itemId ? 'Give it a time' : 'Add'}
	>
		{#if addSheet.itemId}
			<h2>Give "{addSheet.title}" a time</h2>
			<!-- svelte-ignore a11y_autofocus -->
			<label class="field"
				><span class="label">Time</span><input type="time" step="900" bind:value={time} autofocus /></label
			>
			<div class="row">
				<button class="btn" type="button" onclick={close}>Cancel</button>
				<button class="btn primary" type="button" disabled={!time || busy} onclick={giveTime}>Save</button>
			</div>
		{:else}
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
					size="sm"
					autofocus
					label="What and when"
					onenter={plan}
					onescape={close}
					oninput={() => (problem = '')}
				/>
				{#if addSheet.text && parsed.title}
					<p class="pv">
						<b>{parsed.title}</b> · {prettyDate(parsed.date).split(' ').slice(0, 3).join(' ')}
						{#if parsed.time}· {parsed.time}{#if parsed.endTime}–{parsed.endTime}{/if}{/if}
						· {parsed.target === 'planner' ? 'Planner' : parsed.target === 'calendar' ? 'Calendar' : 'Both'}
					</p>
				{/if}
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
	.pv {
		margin: 0;
		font-size: 13px;
	}
	h2 {
		margin: 0;
		font-size: 16px;
	}
</style>
