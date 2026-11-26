<!-- v4.0 PR 16: page emoji icon. Desktop popover 8x5, phone BottomSheet 6 columns, Remove, arrows/Enter/Esc,
     focus returns to the trigger. Curated set only (no search, no full emoji data). -->
<script lang="ts">
	import { onMount } from 'svelte';
	import BottomSheet from './BottomSheet.svelte';
	import { backCloses } from '$lib/client/layers';
	import { isPhone } from '$lib/client/phone';

	let {
		icon,
		disabled = false,
		onpick,
		label = 'Page icon',
		compact = false,
	}: {
		icon: string | null;
		disabled?: boolean;
		onpick: (v: string | null) => unknown;
		/** accessible name prefix (the callout uses "Callout icon") */
		label?: string;
		/** small inline button (callout), same popover / sheet */
		compact?: boolean;
	} = $props();

	// DESIGN 2.2: the exact 40 curated emoji (no search, no full set)
	const EMOJI = [
		'📄', '📝', '📚', '🎓', '💼', '🏠', '🧠', '💡', '✅', '📅',
		'🗂️', '📌', '🔖', '🧪', '🛠️', '💻', '🖥️', '🌐', '🔒', '💰',
		'🛒', '🍳', '🏋️', '🏃', '🧘', '🎮', '🎬', '📺', '🎵', '🎨',
		'✈️', '🚗', '🌱', '🐾', '❤️', '⭐', '🔥', '⚠️', '❓', '🎯',
	]; // prettier-ignore
	let phone = $state(false);
	let open = $state(false);
	let active = $state(0);
	let btn: HTMLButtonElement | undefined = $state();
	let grid: HTMLDivElement | undefined = $state();
	// the callout keeps one instance mounted and pushes a new emoji through setIcon (no remount on editor updates)
	let override = $state<string | null | undefined>(undefined);
	const shown = $derived(override === undefined ? icon : override);
	export function setIcon(v: string | null) {
		override = v;
	}
	onMount(() => (phone = isPhone()));
	const cols = $derived(phone ? 6 : 8);

	/** the page ⋯ menu opens the sheet when the header has no icon button (phone) */
	export function openPicker() {
		if (!open) show();
	}

	function focusCell(i: number) {
		grid?.querySelectorAll<HTMLButtonElement>('.cell')[i]?.focus();
	}
	function show() {
		if (disabled) return;
		open = !open;
		if (open) {
			active = Math.max(0, shown ? EMOJI.indexOf(shown) : 0);
			queueMicrotask(() => focusCell(active));
		}
	}
	function close() {
		open = false;
		queueMicrotask(() => btn?.focus());
	}
	function choose(v: string | null) {
		open = false;
		void onpick(v);
		queueMicrotask(() => btn?.focus());
	}
	function keys(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			return close();
		}
		if (e.key === 'Enter' || e.key === ' ') return; // the focused cell's own click fires
		const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
		const d = step[e.key];
		if (d === undefined) return;
		e.preventDefault();
		active = Math.min(EMOJI.length - 1, Math.max(0, active + d));
		focusCell(active);
	}
</script>

<span class="wrap" class:compact>
	<button
		bind:this={btn}
		class="pickbtn"
		class:empty={!shown}
		type="button"
		{disabled}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label={shown ? `${label}: ${shown}` : `${label}: Add icon`}
		onclick={show}>{shown ?? 'Add icon'}</button
	>
	{#if open && !phone}
		<div
			class="pop card"
			role="dialog"
			tabindex="-1"
			aria-label={label}
			use:backCloses={close}
			onkeydown={keys}
		>
			<button class="remove" type="button" onclick={() => choose(null)}>Remove</button>
			<div class="grid" bind:this={grid} role="listbox" tabindex="-1" aria-label="Emoji" style:--cols={8}>
				{#each EMOJI as e, i (e + i)}
					<button
						type="button"
						role="option"
						class="cell"
						aria-selected={i === active}
						tabindex={i === active ? 0 : -1}
						aria-label={e}
						onclick={() => choose(e)}
						onfocus={() => (active = i)}>{e}</button
					>
				{/each}
			</div>
		</div>
	{/if}
</span>

{#if open && phone}
	<BottomSheet {label} onclose={close}>
		<div class="sheet">
			<div class="head">
				<b>{label}</b>
				<button class="remove" type="button" onclick={() => choose(null)}>Remove</button>
			</div>
			<div class="grid" bind:this={grid} role="listbox" tabindex="-1" aria-label="Emoji" style:--cols={cols}>
				{#each EMOJI as e, i (e + i)}
					<button
						type="button"
						role="option"
						class="cell"
						aria-selected={i === active}
						tabindex={i === active ? 0 : -1}
						aria-label={e}
						onclick={() => choose(e)}
						onfocus={() => (active = i)}>{e}</button
					>
				{/each}
			</div>
		</div>
	</BottomSheet>
{/if}

<style>
	.wrap {
		position: relative;
		flex: none;
		display: inline-flex;
	}
	.pickbtn {
		border: 0;
		background: none;
		color: var(--ink);
		border-radius: 10px;
		font: inherit;
		font-size: 36px;
		line-height: 1;
		padding: 4px;
		min-width: 56px;
		min-height: 56px;
		cursor: pointer;
	}
	.pickbtn:hover {
		background: var(--hover);
	}
	.pickbtn.empty {
		min-width: 0;
		min-height: 24px;
		padding: 0 6px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--faint);
		text-align: left;
	}
	.pickbtn.empty::before {
		content: '☺ ';
	}
	.pickbtn:disabled {
		cursor: default;
		opacity: 0.6;
	}
	/* inline variant for the callout: 24 px (48 dp phone), same picker */
	.wrap.compact .pickbtn {
		min-width: 24px;
		min-height: 24px;
		padding: 0 2px;
		font-size: 16px;
	}
	.wrap.compact .pickbtn.empty {
		min-width: 24px;
		min-height: 24px;
		font-size: 11px;
	}
	.pop {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 70;
		width: 320px;
		padding: 8px;
		border: 1.5px solid var(--border);
		border-radius: 12px;
		box-shadow: -4px 4px 0 var(--accent);
		background: var(--card);
	}
	.remove {
		position: absolute;
		top: 8px;
		right: 12px;
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		border: 0;
		background: none;
		color: var(--quiet);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 2px;
		margin-top: 8px;
	}
	.cell {
		border: 0;
		background: none;
		font-size: 20px;
		line-height: 1;
		width: 100%;
		aspect-ratio: 1;
		border-radius: 8px;
		cursor: pointer;
	}
	.cell:hover,
	.cell:focus-visible {
		background: var(--hover);
	}
	.sheet .head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sheet .remove {
		position: static;
		min-height: 48px;
	}
	/* phone: 48 dp tap box (repo rule) around an ~44 px glyph; empty = the ⋯ sheet owns it (DESIGN 2.1) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.pickbtn {
			min-width: 48px;
			min-height: 48px;
			font-size: 32px;
		}
		.wrap.compact .pickbtn {
			min-width: 48px;
			min-height: 48px;
			font-size: 26px;
		}
		.pickbtn.empty {
			display: none;
		}
		.sheet .cell {
			min-height: 48px;
			font-size: 24px;
		}
	}
</style>
