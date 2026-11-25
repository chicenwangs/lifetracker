<!-- Phone "+ Add" bottom sheet (FEATURES §10): Plan it (same quick-add grammar + live slots) · Quick note (Keep). -->
<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$lib/client/refresh';
	import { ApiError, post } from '$lib/client/api';
	import { enqueue, enqueueAction, isOffline } from '$lib/client/offline';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { qaPrefs } from '$lib/client/itemtypes.svelte';
	import { addSheet, closeAdd } from '$lib/client/mobile.svelte';
	import { buzz } from '$lib/client/haptics';
	import { hasSpeech, speech } from '$lib/client/native';
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
	// After a save the sheet closes under the finger: keep an invisible guard for a moment so the rest of
	// a rapid tap burst cannot reach the page beneath (#378).
	let tapGuard = $state(false);
	let guardTimer: ReturnType<typeof setTimeout> | undefined;
	// v4 PR 13: dictation in the Quick note tab (Android app only; the web build shows no mic)
	const ASKED_KEY = 'lt_speech_asked';
	let speechReady = $state(false);
	let listening = $state(false);
	let micOff = $state(false);
	let rationale = $state(false);
	let asked = false;
	let noteEl = $state<HTMLTextAreaElement>();
	onMount(() => {
		speechReady = hasSpeech();
		try {
			asked = localStorage.getItem(ASKED_KEY) === '1';
		} catch {
			/* private mode */
		}
	});
	function stopDictation() {
		if (!listening) return;
		listening = false;
		speech()
			?.stop()
			.catch(() => {});
	}
	const close = () => {
		stopDictation();
		rationale = false;
		closeAdd();
		problem = '';
	};
	const closeGuarded = () => {
		close();
		tapGuard = true;
		clearTimeout(guardTimer);
		guardTimer = setTimeout(() => (tapGuard = false), 400);
	};
	async function plan() {
		if (busy) return;
		if (!parsed.ok) return void (problem = (parsed.problems[0] ?? '').replace(/`/g, ''));
		busy = true;
		try {
			const r = await post<{ warnings?: string[] }>('/api/quickadd', {
				text: addSheet.text,
				day: addSheet.day ?? undefined,
			});
			buzz('success');
			showToast(`Added "${parsed.title}"` + (r.warnings?.length ? ` · ${r.warnings.join(' · ')}` : ''), {
				ms: r.warnings?.length ? 8000 : undefined,
			});
			addSheet.text = ''; // batch add: sheet stays open
			problem = '';
			calendarChanged();
		} catch (e) {
			if (waitsForSignIn(e)) {
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
	// offline, or the session ended (401 redirects to sign-in): keep the text in the queue, it is sent after sign-in (#305)
	const waitsForSignIn = (e: unknown) => isOffline(e) || (e instanceof ApiError && e.status === 401);
	/** dictation text goes in where the cursor is, with one space if the words would run together */
	function insertText(raw: string) {
		const text = raw.trim();
		if (!text) return;
		const el = noteEl;
		const start = el?.selectionStart ?? note.length;
		const end = el?.selectionEnd ?? note.length;
		const before = note.slice(0, start);
		const sep = before && !/\s$/.test(before) ? ' ' : '';
		note = before + sep + text + note.slice(end);
		const caret = start + sep.length + text.length;
		void tick().then(() => el?.setSelectionRange(caret, caret));
	}
	async function dictate() {
		const p = speech();
		if (!p) return;
		listening = true;
		try {
			const r = await p.listen({ preferOffline: true });
			insertText(r.text);
			micOff = false;
		} catch (e) {
			const code = (e as { code?: string }).code;
			if (code === 'denied') {
				micOff = true;
				showToast('Microphone is off for Life Tracker. Turn it on in Android settings.');
			} else if (code !== 'no-speech' && code !== 'busy') showError(e);
		} finally {
			listening = false;
		}
	}
	function micTap() {
		if (listening) return stopDictation();
		if (!asked) {
			asked = true;
			rationale = true;
			return;
		}
		void dictate();
	}
	function micAsked(start: boolean) {
		rationale = false;
		try {
			localStorage.setItem(ASKED_KEY, '1');
		} catch {
			/* private mode */
		}
		if (start) void dictate();
	}
	async function saveNote() {
		if (busy || !note.trim()) return;
		busy = true;
		try {
			await post('/api/keep/notes', { body: note });
			note = '';
			buzz('success');
			showToast('Note saved');
			closeGuarded();
			await invalidateAll();
		} catch (e) {
			if (waitsForSignIn(e)) {
				enqueue({
					key: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
					noteId: null,
					payload: { body: note },
				});
				note = '';
				buzz('success');
				showToast('Note saved · Waiting to sync');
				closeGuarded();
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
				<div class="composer">
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						bind:this={noteEl}
						bind:value={note}
						rows="5"
						placeholder={listening ? 'Listening…' : 'Note'}
						aria-label="Note"
						maxlength="20000"
						autofocus></textarea>
					{#if speechReady}
						<button
							class="mic"
							class:on={listening}
							class:off={micOff}
							type="button"
							aria-label={listening ? 'Stop listening' : 'Dictate note'}
							aria-pressed={listening}
							title={listening ? 'Stop listening' : 'Dictate note'}
							onclick={micTap}
						>
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill={listening ? 'currentColor' : 'none'}
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								aria-hidden="true"
								><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" /><path
									d="M5 11a7 7 0 0 0 14 0M12 18v3"
								/></svg
							>
						</button>
					{/if}
				</div>
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
{#if rationale}
	<BottomSheet label="Use the microphone?" onclose={() => micAsked(false)}>
		<p class="why">
			Life Tracker uses the microphone only while you hold this on. Speech is turned into text on your phone.
		</p>
		<div class="row">
			<button class="btn" type="button" onclick={() => micAsked(false)}>Not now</button>
			<button class="btn primary" type="button" onclick={() => micAsked(true)}>Continue</button>
		</div>
	</BottomSheet>
{/if}
{#if tapGuard}
	<div class="tap-guard" aria-hidden="true"></div>
{/if}

<style>
	/* invisible, above the page for the rest of a tap burst after Save closes the sheet (#378) */
	.tap-guard {
		position: fixed;
		inset: 0;
		z-index: 130; /* above the toast (120), which lands on the Save spot in landscape; below dialogs (140) */
		touch-action: none;
	}
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
		min-height: 48px;
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
	/* v4 PR 13: note field + 48 dp mic on the right (app only) */
	.composer {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}
	.composer textarea {
		flex: 1;
		min-width: 0;
	}
	.mic {
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: 24px;
		border: 1.5px solid var(--border);
		background: var(--card);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.mic.on {
		background: var(--pill);
		color: var(--pill-ink);
		border-color: var(--pill);
		animation: mic-ring 1.4s ease-out infinite;
	}
	.mic.off {
		opacity: 0.45;
	}
	@keyframes mic-ring {
		0% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--pill) 55%, transparent);
		}
		70%,
		100% {
			box-shadow: 0 0 0 10px transparent;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mic.on {
			animation: none;
			box-shadow: 0 0 0 6px var(--pill);
		}
	}
	.why {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--quiet);
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
