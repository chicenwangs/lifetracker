<!-- In-app confirm / text dialog (#109, G10). Themed, 48 dp buttons on phone, Back / Esc / scrim = cancel. -->
<script lang="ts">
	import { answer, dialog } from '$lib/client/dialog.svelte';
	import { backCloses } from '$lib/client/layers';

	let value = $state('');
	let scope = $state<'this' | 'following' | 'all'>('this');
	$effect(() => {
		if (dialog.current?.kind === 'text') value = dialog.current.value;
		else if (dialog.current?.kind === 'scope') scope = 'this';
	});
	const ok = () =>
		answer(dialog.current?.kind === 'text' ? value : dialog.current?.kind === 'scope' ? scope : true);
	const cancel = () => answer(null);
</script>

{#if dialog.current}
	{@const d = dialog.current}
	<div class="scrim" role="presentation" onclick={cancel}></div>
	<div
		class="dlg card"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="dlg-t"
		tabindex="-1"
		use:backCloses={cancel}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				cancel();
			}
		}}
	>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				ok();
			}}
		>
			<p id="dlg-t">{d.text}</p>
			{#if d.kind === 'text'}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="in" bind:value aria-label={d.label} autofocus />
			{:else if d.kind === 'scope'}
				<div class="scopes" role="radiogroup" aria-labelledby="dlg-t">
					<label class="sopt">
						<input type="radio" name="rscope" value="this" bind:group={scope} />
						<span>This item</span>
					</label>
					<label class="sopt">
						<input type="radio" name="rscope" value="following" bind:group={scope} />
						<span>This and following</span>
					</label>
					<label class="sopt">
						<input type="radio" name="rscope" value="all" bind:group={scope} />
						<span>All items</span>
					</label>
				</div>
			{/if}
			<div class="row">
				<button class="btn" type="button" onclick={cancel}>Cancel</button>
				<!-- svelte-ignore a11y_autofocus -->
				<button
					class="btn primary"
					class:danger={(d.kind === 'confirm' || d.kind === 'scope') && d.danger}
					type="submit"
					autofocus={d.kind !== 'text'}>{d.ok}</button
				>
			</div>
		</form>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 140;
		background: var(--scrim);
	}
	.dlg {
		position: fixed;
		z-index: 141;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		width: min(420px, calc(100vw - 32px));
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		animation: lt-pop 160ms var(--ease) both;
	}
	form {
		display: contents;
	}
	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
		white-space: pre-line;
	}
	.in {
		min-height: 44px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1.5px solid var(--border);
		background: var(--field);
		color: var(--ink);
		font: inherit;
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.scopes {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sopt {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 8px;
		border-radius: 8px;
		cursor: pointer;
	}
	.sopt:hover {
		background: var(--hover);
	}
	.danger {
		background: var(--danger);
		color: var(--card);
		border-color: var(--danger);
	}
</style>
