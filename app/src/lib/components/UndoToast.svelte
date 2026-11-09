<script lang="ts">
	import { closeToast, toast } from '$lib/client/toast.svelte';
</script>

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
</style>
