<script lang="ts">
	import { closeToast, toast } from '$lib/client/toast.svelte';
	import { undid } from '$lib/client/undo.svelte';
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

	// swipe sideways to dismiss (#111, M3 snackbar); × stays the tap path
	let dx = $state(0);
	let x0 = $state<number | null>(null);
	const down = (e: PointerEvent) => {
		if ((e.target as Element).closest('button')) return;
		x0 = e.clientX;
	};
	const move = (e: PointerEvent) => {
		if (x0 !== null) dx = e.clientX - x0;
	};
	const up = () => {
		if (x0 !== null && Math.abs(dx) > 80) closeToast();
		x0 = null;
		dx = 0;
	};
</script>

<!-- centre note after Ctrl+Z: never takes clicks -->
<div class="centre" aria-live="polite">
	{#if undid.text}
		{#key undid.id}
			<div class="undid" role="status">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg
				>
				<span>{undid.text}</span>
				<kbd>{mac ? '⌘' : 'Ctrl'}+Z</kbd>
			</div>
		{/key}
	{/if}
</div>

<div class="wrap" aria-live="polite">
	{#if toast.current}
		{@const t = toast.current}
		<div
			class="toast"
			class:error={t.kind === 'error'}
			class:moving={x0 !== null}
			role={t.kind === 'error' ? 'alert' : 'status'}
			style:translate={dx ? `${dx}px 0` : null}
			style:opacity={dx ? Math.max(0.2, 1 - Math.abs(dx) / 200) : null}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			{#if t.onclick}
				<button
					class="open"
					type="button"
					onclick={async () => {
						const fn = t.onclick;
						closeToast();
						await fn?.();
					}}>{t.text}</button
				>
			{:else}
				<span>{t.text}</span>
			{/if}
			{#if t.actions?.length}
				<div class="acts">
					{#each t.actions as a (a.label)}
						<button
							class="undo"
							type="button"
							onclick={async () => {
								closeToast();
								await a.run();
							}}>{a.label}</button
						>
					{/each}
				</div>
			{/if}
			{#if t.undo}
				<button
					class="undo"
					type="button"
					onclick={async () => {
						const u = t.undo;
						closeToast();
						await u?.();
					}}>Undo</button
				>
			{/if}
			<button class="x" type="button" aria-label="Close" onclick={closeToast}>×</button>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		font-size: 13px;
		max-width: min(560px, 90vw);
		background: var(--toast);
		color: var(--toast-ink);
		border-radius: 12px;
		box-shadow: -4px 4px 0 var(--accent);
	}
	.toast.error {
		background: var(--exam-bg);
		color: var(--exam-ink);
	}
	.undo {
		padding: 4px 10px;
		font-weight: 600;
		cursor: pointer;
		background: transparent;
		color: inherit;
		border: 1.5px solid currentColor;
		border-radius: 8px;
	}
	.open {
		flex: 1;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.x {
		background: none;
		border: 0;
		font-size: 18px;
		cursor: pointer;
		line-height: 1;
		padding: 0 2px;
		color: inherit;
	}

	.toast {
		animation: lt-rise 240ms var(--ease) both;
		touch-action: pan-y;
		transition:
			translate 160ms var(--ease),
			opacity 160ms var(--ease);
	}
	.toast.moving {
		transition: none;
	}
	/* phone: a snackbar just above the bottom bar, never on it (#111); full width, 48 dp buttons */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.wrap {
			left: 8px;
			right: 8px;
			transform: none;
			bottom: calc(76px + env(safe-area-inset-bottom));
		}
		/* O-10 / D-V4-17: an open BottomSheet publishes its top edge; the toast sits 8 px above it so it
		   never covers the sheet's button row */
		:global(html[data-sheet]) .wrap {
			bottom: calc(100dvh - var(--sheet-top, 50dvh) + 8px);
		}
		.toast {
			max-width: none;
			min-height: 48px;
			padding: 4px 4px 4px 16px;
			font-size: 14px;
		}
		.toast > span,
		.open {
			flex: 1;
			min-height: 48px;
			display: flex;
			align-items: center;
		}
		.undo,
		.x {
			min-width: 48px;
			min-height: 48px;
		}
		.undo {
			border: 0;
		}
	}
	.centre {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
		z-index: 120;
	}
	.undid {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 18px;
		font-size: 14px;
		background: var(--toast);
		color: var(--toast-ink);
		border-radius: 12px;
		box-shadow: -4px 4px 0 var(--accent);
		animation: lt-rise 200ms var(--ease) both;
	}
	kbd {
		font: inherit;
		font-size: 12px;
		opacity: 0.8;
		border: 1px solid currentColor;
		border-radius: 5px;
		padding: 1px 5px;
	}
	/* no key hint on phone (#363) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		kbd {
			display: none;
		}
	}
</style>
