<!-- Theme + "when do you plan your day" (plan-ahead). Saves on change. -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { setPlanMode, setTheme, themeState, type PlanMode } from '$lib/client/prefs.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';

	let { data } = $props();
	let plan = $derived<PlanMode | null>(data.user?.planMode ?? null);

	const PLAN: { v: PlanMode; label: string; hint: string }[] = [
		{
			v: 'night',
			label: 'Before bed',
			hint: "Once today's last block or timed item is over, Home opens on tomorrow's planner so you can plan it.",
		},
		{
			v: 'morning',
			label: 'First thing in the morning',
			hint: 'Home always opens on today. Plan the day when you wake up.',
		},
		{ v: 'off', label: 'Off', hint: 'Home always opens on today.' },
	];

	async function pick(v: PlanMode) {
		const prev = plan;
		plan = v;
		try {
			await setPlanMode(v);
			await invalidateAll();
			showToast('Saved');
		} catch (e) {
			plan = prev;
			showError(e);
		}
	}
</script>

<svelte:head><title>Preferences · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Preferences</h1>
	<fieldset class="field">
		<legend class="label">Theme</legend>
		<div class="row">
			{#each ['dark', 'light'] as const as t (t)}
				<label class="opt">
					<input
						type="radio"
						name="theme"
						value={t}
						checked={themeState.value === t}
						onchange={() => setTheme(t)}
					/>
					{t === 'dark' ? 'Dark' : 'Light'}
				</label>
			{/each}
		</div>
		<span class="hint">Also the sun / moon button in the header.</span>
	</fieldset>
</section>

<section class="card panel">
	<h2>When do you plan your day?</h2>
	<fieldset class="field">
		<legend class="sr-only">Plan ahead</legend>
		{#each PLAN as p (p.v)}
			<label class="opt big">
				<input type="radio" name="plan" value={p.v} checked={plan === p.v} onchange={() => pick(p.v)} />
				<span><b>{p.label}</b><span class="hint">{p.hint}</span></span>
			</label>
		{/each}
		{#if plan === null}<span class="hint">Not picked yet: Home opens on today.</span>{/if}
	</fieldset>
</section>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	.opt {
		display: flex;
		gap: 8px;
		align-items: center;
		cursor: pointer;
		font-size: 14px;
	}
	.opt.big {
		align-items: flex-start;
		padding: 10px 12px;
		border: 1px solid var(--rule);
		border-radius: 10px;
	}
	.opt.big:has(input:checked) {
		border-color: var(--ink);
	}
	.opt.big input {
		margin-top: 3px;
	}
	.opt.big > span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	input[type='radio'] {
		width: 16px;
		height: 16px;
		accent-color: var(--ink);
	}
</style>
