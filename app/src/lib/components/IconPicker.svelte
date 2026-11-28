<!-- Card 16 (DESIGN §2.2, D-V4-22): the shared emoji picker. 40 curated icons only, no search, no full set.
     Desktop = a 320 px popover, 8 × 5 grid of 36 px cells, arrows move / Enter picks / Esc closes, Back closes.
     Phone = the shared BottomSheet with 6 columns of 48 dp cells. The caller owns the trigger and focus return. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import BottomSheet from './BottomSheet.svelte';
	import { backCloses } from '$lib/client/layers';
	import { isPhone } from '$lib/client/phone';

	/** DESIGN §2.2 line 72, in board order. */
	const ICONS =
		'📄 📝 📚 🎓 💼 🏠 🧠 💡 ✅ 📅 🗂️ 📌 🔖 🧪 🛠️ 💻 🖥️ 🌐 🔒 💰 🛒 🍳 🏋️ 🏃 🧘 🎮 🎬 📺 🎵 🎨 ✈️ 🚗 🌱 🐾 ❤️ ⭐ 🔥 ⚠️ ❓ 🎯'.split(
			' ',
		);
	const N = ICONS.length;

	let {
		value = null,
		onpick,
		onclose,
	}: {
		value?: string | null;
		/** the chosen emoji, or null for Remove */
		onpick: (icon: string | null) => void;
		onclose: () => void;
	} = $props();

	const phone = isPhone();
	const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
	let at = $state(0);
	let box: HTMLDivElement | undefined = $state();
	onMount(() => {
		at = Math.max(0, ICONS.indexOf(value ?? '')); // start on the page's icon
		box?.focus();
	});

	function key(e: KeyboardEvent) {
		const step = STEPS[e.key];
		if (step !== undefined) {
			e.preventDefault();
			at = (at + step + N) % N;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const picked = ICONS[at];
			if (picked) onpick(picked);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}
</script>

{#snippet picker()}
	<div class="top">
		<b>Icon</b><button class="rm" type="button" onclick={() => onpick(null)}>Remove</button>
	</div>
	<div class="grid" role="group" aria-label="Emoji">
		{#each ICONS as e, i (e)}
			<button class="cell" class:on={i === at} type="button" tabindex="-1" onclick={() => onpick(e)}
				>{e}</button
			>
		{/each}
	</div>
{/snippet}

{#if phone}
	<BottomSheet label="Icon" {onclose}>
		{@render picker()}
	</BottomSheet>
{:else}
	<div
		class="pick"
		role="dialog"
		aria-label="Icon"
		tabindex="-1"
		bind:this={box}
		use:backCloses={onclose}
		onkeydown={key}
	>
		{@render picker()}
	</div>
{/if}

<style>
	.pick {
		position: absolute;
		left: 0;
		top: 60px;
		z-index: 30;
		width: 320px;
		padding: 10px 16px 16px;
		background: var(--card);
		color: var(--ink);
		border: 1.5px solid var(--card-edge);
		border-radius: 12px;
		box-shadow: -4px 4px 0 var(--accent);
		outline: none;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 28px;
		font-size: 13px;
	}
	.rm {
		min-height: 24px;
		padding: 0 4px;
		background: none;
		border: 0;
		color: var(--quiet);
		font: inherit;
		font-size: 12.5px;
		text-decoration: underline;
		cursor: pointer;
	}
	.rm:hover {
		color: var(--ink);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(8, 36px);
		grid-auto-rows: 36px;
	}
	.cell {
		width: 36px;
		height: 36px;
		padding: 0;
		background: none;
		border: 0;
		border-radius: 8px;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}
	.cell:hover,
	.cell.on {
		background: var(--pill-card);
	}
	.cell.on {
		outline: 2px solid var(--accent);
	}
	/* phone (DESIGN §2.2 line 71): 6 columns, 48 dp cells, no key hints */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.grid {
			grid-template-columns: repeat(6, 48px);
			grid-auto-rows: 48px;
		}
		.cell {
			width: 48px;
			height: 48px;
			font-size: 26px;
		}
		.rm {
			min-height: 48px;
			padding: 0 8px;
		}
	}
</style>
