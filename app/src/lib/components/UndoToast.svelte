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
		background: var(--ink);
		color: #fff;
		padding: 10px 14px;
		border-radius: 10px;
		font-size: 13px;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.2);
		max-width: min(560px, 90vw);
	}
	.toast.error {
		background: var(--exam-ink);
	}
	.undo {
		background: #fff;
		color: var(--ink);
		border: 0;
		border-radius: 6px;
		padding: 4px 10px;
		font-weight: 600;
		cursor: pointer;
	}
	.x {
		background: none;
		border: 0;
		color: #fff;
		font-size: 18px;
		cursor: pointer;
		line-height: 1;
		padding: 0 2px;
	}
</style>
