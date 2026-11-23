<!-- Phone "+ Add" bottom sheet (FEATURES §10): Plan it (same quick-add grammar + live slots) · Quick note (Keep). -->
<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$lib/client/refresh';
	import { post } from '$lib/client/api';
	import { enqueue, enqueueAction, isOffline } from '$lib/client/offline';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { qaPrefs } from '$lib/client/itemtypes.svelte';
	import { addSheet, closeAdd } from '$lib/client/mobile.svelte';
	import { buzz } from '$lib/client/haptics';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { parseQuickAdd } from '$lib/quickadd';
	import { nowLocalMinutes, todayLocal } from '$lib/time';
	import BottomSheet from './BottomSheet.svelte';
	import CommandInput from './CommandInput.svelte';
	import QASlots from './QASlots.svelte';

	const tz = $derived(page.data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const ctx = $derived({
		today: todayLocal(tz),
		day: addSheet.day ?? undefined,
		nowMinutes: nowLocalMinutes(tz),
		...qaPrefs(page.data.user),
	});
	const parsed = $derived(parseQuickAdd(addSheet.text, ctx));
	let busy = $state(false);
	let problem = $state('');
	let note = $state('');

	const close = () => {
		closeAdd();
		problem = '';
	};
	async function plan() {
		if (busy) return;
		if (!parsed.ok) return void (problem = (parsed.problems[0] ?? '').replace(/`/g, ''));
		busy = true;
		try {
			await post('/api/quickadd', { text: addSheet.text, day: addSheet.day ?? undefined });
			buzz('success');
			showToast(`Added "${parsed.title}"`);
			addSheet.text = ''; // batch add: sheet stays open
			problem = '';
			calendarChanged();
		} catch (e) {
			if (isOffline(e)) {
				enqueueAction({
					key: `qa_${Date.now()}_${Math.random().toString(36).slice(2)}`,
					method: 'POST',
					path: '/api/quickadd',
					payload: { text: addSheet.text, day: addSheet.day ?? undefined },
				});
				buzz('success');
				showToast(`Added "${parsed.title}" · Waiting to sync`);
				addSheet.text = '';
				problem = '';
				return;
			}
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
			buzz('success');
			showToast('Note saved');
			close();
			await invalidateAll();
		} catch (e) {
			if (isOffline(e)) {
				enqueue({
					key: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
					noteId: null,
					payload: { body: note },
				});
				note = '';
				buzz('success');
				showToast('Note saved · Waiting to sync');
				close();
				return;
			}
			showError(e); // text stays in the box
		} finally {
			busy = false;
		}
	}
</script>

{#if addSheet.open}
	<BottomSheet
		label="Add"
		onclose={close}
		intro={addSheet.from ? 'grow' : 'rise'}
		origin={addSheet.from ?? undefined}
	>
		<div class="add">
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
					<button class="btn wide" type="button" onclick={close}>Close</button>
					<button class="btn primary" type="button" disabled={busy || !addSheet.text.trim()} onclick={plan}
						>Add</button
					>
				</div>
			{:else}
				<!-- svelte-ignore a11y_autofocus -->
				<textarea bind:value={note} rows="5" placeholder="Note" aria-label="Note" maxlength="20000" autofocus
				></textarea>
				<div class="row">
					<button class="btn wide" type="button" onclick={close}>Close</button>
					<button class="btn primary" type="button" disabled={busy || !note.trim()} onclick={saveNote}
						>Save note</button
					>
				</div>
			{/if}
		</div>
	</BottomSheet>
{/if}

<style>
	.add {
		display: flex;
		flex-direction: column;
		gap: 12px;
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
		/* main button stays in view when the keyboard shrinks the sheet (#118) */
		position: sticky;
		bottom: 0;
		padding: 8px 0;
		background: var(--card);
	}
	/* the shared sheet's Close is phone-only; wide screens (landscape until #110) need this one */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.wide {
			display: none;
		}
	}
	.add :global(.iw.lg) {
		border: 1.5px solid var(--border);
		border-radius: 10px;
		background: var(--card);
	}
	.add :global(.slots) {
		padding: 0;
		border: 0;
	}
</style>
