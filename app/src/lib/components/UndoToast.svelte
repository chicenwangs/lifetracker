<script lang="ts">
	import { closeToast, toast } from '$lib/client/toast.svelte';
	import { undid } from '$lib/client/undo.svelte';
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
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
		<div class="toast" class:error={t.kind === 'error'} role={t.kind === 'error' ? 'alert' : 'status'}>
			<span>{t.text}</span>
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
</style>
