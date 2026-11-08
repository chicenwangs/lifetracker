<!-- FR-S10: show calendars shared with me on top of mine. Hidden when nothing is shared with me. -->
<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { patch } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';

	type Shared = { id: string; name: string; color: string; inOverlap: boolean };
	const shared = $derived((page.data.shared ?? []) as Shared[]);
	const shownPeople = $derived(shared.filter((s) => s.inOverlap));
	let busy = $state(false);
	let on = $derived(!!page.data.user?.overlapOn);

	async function toggle() {
		if (busy) return;
		busy = true;
		const next = !on;
		on = next;
		try {
			await patch('/api/me/prefs', { overlapOn: next });
		} catch (e) {
			on = !next;
			showError(e);
			busy = false;
			return;
		}
		try {
			await invalidateAll(); // saved; a failed reload must not flip the switch back
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if shared.length}
	<button
		class="ov"
		class:on
		type="button"
		role="switch"
		aria-checked={on}
		title={on ? 'Hide shared calendars' : 'Show shared calendars'}
		onclick={toggle}
	>
		<span class="faces" aria-hidden="true">
			{#each shownPeople.slice(0, 3) as s (s.id)}
				<span class="face" style:background={s.color}>{s.name.slice(0, 1).toUpperCase()}</span>
			{/each}
		</span>
		<span class="lbl">Overlap</span>
		<span class="track" aria-hidden="true"><span class="knob"></span></span>
	</button>
{/if}

<style>
	.ov {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 6px 0 6px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.ov:hover {
		background: var(--hover);
	}
	.faces {
		display: inline-flex;
	}
	.face {
		width: 20px;
		height: 20px;
		border-radius: 10px;
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--ink) 45%, transparent),
			0 0 0 2.5px var(--card);
	}
	.face + .face {
		margin-left: -6px;
	}
	.ov:not(.on) .faces {
		opacity: 0.45;
	}
	.track {
		width: 30px;
		height: 18px;
		border-radius: 9px;
		background: var(--border);
		position: relative;
		transition: background 0.15s;
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 7px;
		background: var(--card);
		transition: left 0.15s;
	}
	.on .track {
		background: var(--ink);
	}
	.on .knob {
		left: 14px;
	}
</style>
