<!-- FR-Q1/Q2. N focuses. Live preview. Enter saves. Esc clears. Server re-parses (truth). -->
<script lang="ts">
	import { parseQuickAdd, type QACourse } from '$lib/quickadd';
	import { nowLocalMinutes, prettyDate, prettyTime, todayLocal } from '$lib/time';
	import { post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { colorsFor } from '$lib/colors';

	let { courses, tz }: { courses: QACourse[]; tz: string } = $props();
	let text = $state('');
	let busy = $state(false);
	let input: HTMLInputElement | undefined = $state();

	const preview = $derived(
		text.trim()
			? parseQuickAdd(text, { today: todayLocal(tz), nowMinutes: nowLocalMinutes(tz), courses })
			: null,
	);

	async function save() {
		if (!preview || !preview.ok || busy) return;
		busy = true;
		try {
			const r = await post<{ item: { title: string; date: string } }>('/api/quickadd', { text });
			showToast(`Added "${r.item.title}" · ${prettyDate(r.item.date)}`);
			text = '';
			calendarChanged();
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== 'n' && e.key !== 'N') return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		e.preventDefault();
		input?.focus();
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="qa">
	<label for="qa" class="sr-only">Quick add</label>
	<input
		id="qa"
		bind:this={input}
		bind:value={text}
		class="box"
		autocomplete="off"
		placeholder="Quick add: ds quiz fri 2pm !exam #ds (press N)"
		aria-describedby="qa-preview"
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				save();
			} else if (e.key === 'Escape') {
				text = '';
				input?.blur();
			}
		}}
	/>
	<div id="qa-preview" class="preview" aria-live="polite">
		{#if preview}
			{#if preview.ok}
				{@const c = colorsFor(preview.type)}
				<span class="chip" style:background={c.bg} style:color={c.ink}>{preview.type}</span>
				<b>{preview.title}</b>
				<span>· {prettyDate(preview.date)}{preview.time ? ` ${prettyTime(preview.time)}` : ''}</span>
				{#if preview.courseCode}<span>· #{preview.courseCode}</span>{/if}
				{#each preview.warnings as w (w)}<span class="warn">· {w}</span>{/each}
				<span class="hint">Enter to add</span>
			{:else}
				<span class="warn">{preview.reason}</span>
			{/if}
		{/if}
	</div>
</div>

<style>
	.qa {
		position: relative;
		flex: 0 1 440px;
		min-width: 0;
	}
	.box {
		width: 100%;
		height: 40px;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0 12px;
		font-size: 13px;
		background: var(--ground);
	}
	.box:focus {
		background: var(--card);
		border-color: var(--input);
	}
	.preview {
		position: absolute;
		top: 44px;
		left: 0;
		right: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		z-index: 30;
	}
	.preview:not(:empty) {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 8px 10px;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.08);
	}
	.qa:not(:focus-within) .preview {
		display: none;
	}
	.chip {
		padding: 1px 6px;
		border-radius: 5px;
		font-weight: 600;
		font-size: 11px;
	}
	.warn {
		color: var(--exam-ink);
	}
	.hint {
		margin-left: auto;
		color: var(--quiet);
	}
</style>
