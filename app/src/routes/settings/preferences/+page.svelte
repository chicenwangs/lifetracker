<!-- Theme (Light/Dark/Auto + schedule), timezone, planner defaults, plan-ahead. Each control saves on change. -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { apiFetch, patch } from '$lib/client/api';
	import {
		saveTheme,
		setPlanMode,
		themeState,
		type PlanMode,
		type ThemeMode,
	} from '$lib/client/prefs.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { schedulePreview } from '$lib/theme';

	let { data } = $props();
	let plan = $derived<PlanMode | null>(data.user?.planMode ?? null);
	const u = $derived(data.user as App.SafeUser);
	// every IANA zone the browser knows; the saved one first so it's never missing
	const ZONES = $derived([...new Set([u.timezone, ...Intl.supportedValuesOf('timeZone')])]);
	const zoneLabel = (z: string) => {
		const off = new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'longOffset' })
			.formatToParts(new Date())
			.find((p) => p.type === 'timeZoneName')
			?.value.replace('GMT', 'UTC');
		return `${z.replace(/_/g, ' ')} (${off === 'UTC' ? 'UTC+00:00' : off})`;
	};

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

	/** generic save for the other prefs */
	async function save(p: Record<string, unknown>) {
		try {
			await patch('/api/me/prefs', p);
			await invalidateAll();
			if ('timezone' in p) themeState.tz = String(p.timezone);
			showToast('Saved');
		} catch (e) {
			showError(e);
			await invalidateAll(); // put the control back to what the server has
		}
	}
	async function theme(p: Parameters<typeof saveTheme>[0]) {
		try {
			await saveTheme(p);
			showToast('Saved');
		} catch {
			/* saveTheme showed the error and rolled back */
		}
	}
	// header pins (FEATURES §2): order + unpin; the server keeps the cap and the order per user
	const pins = $derived((data.pins ?? []) as { id: string; title: string }[]);
	async function setPins(ids: string[], msg: string) {
		try {
			await apiFetch('PUT', '/api/page-shortcuts', { ids });
			await invalidateAll();
			showToast(msg);
		} catch (e) {
			showError(e);
		}
	}
	function movePin(i: number, d: -1 | 1) {
		const ids = pins.map((p) => p.id);
		[ids[i], ids[i + d]] = [ids[i + d] as string, ids[i] as string];
		void setPins(ids, 'Pins reordered');
	}
	const MODES: { v: ThemeMode; label: string }[] = [
		{ v: 'light', label: 'Light' },
		{ v: 'dark', label: 'Dark' },
		{ v: 'auto', label: 'Auto' },
	];
</script>

<svelte:head><title>Preferences · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Preferences</h1>
	<fieldset class="field">
		<legend class="label">Theme</legend>
		<div class="row">
			{#each MODES as m (m.v)}
				<label class="opt">
					<input
						type="radio"
						name="theme"
						value={m.v}
						checked={themeState.mode === m.v}
						onchange={() => theme({ themeMode: m.v })}
					/>
					{m.label}
				</label>
			{/each}
		</div>
		<div class="row times">
			<label class="field"
				><span class="label">Light from</span>
				<input
					type="time"
					step="60"
					value={themeState.light}
					onchange={(e) => e.currentTarget.value && theme({ themeLightStart: e.currentTarget.value })}
				/></label
			>
			<label class="field"
				><span class="label">Dark from</span>
				<input
					type="time"
					step="60"
					value={themeState.dark}
					onchange={(e) => e.currentTarget.value && theme({ themeDarkStart: e.currentTarget.value })}
				/></label
			>
		</div>
		<span class="hint"
			>{schedulePreview(themeState.light, themeState.dark)}. Used when Theme is Auto. The sun / moon button in
			the header picks a fixed Light or Dark.</span
		>
	</fieldset>
	<label class="field">
		<span class="label">Timezone</span>
		<select value={u.timezone} onchange={(e) => save({ timezone: e.currentTarget.value })}>
			{#each ZONES as z (z)}<option value={z}>{zoneLabel(z)}</option>{/each}
		</select>
		<span class="hint">Dates, times, the planner and Auto theme follow this.</span>
	</label>
</section>

<section class="card panel">
	<h2>Planner defaults</h2>
	<label class="field">
		<span class="label">Region style</span>
		<select value={u.region} onchange={(e) => save({ region: e.currentTarget.value })}>
			<option value="my">Malaysia / UK: week starts Monday, 24 h clock, 16/11 = 16 Nov</option>
			<option value="us">US: week starts Sunday, 12 h clock, 11/16 = 16 Nov</option>
		</select>
	</label>
	<label class="field">
		<span class="label">Quick add goes to</span>
		<select value={u.qaTarget} onchange={(e) => save({ qaTarget: e.currentTarget.value })}>
			<option value="timeline">Timeline (planner block)</option>
			<option value="calendar">Calendar (item)</option>
		</select>
		<span class="hint"
			>When you don't type /calendar, /both or /planner. Double-clicking a month day still adds to the
			calendar.</span
		>
	</label>
	<label class="field">
		<span class="label">Default block length</span>
		<select value={String(u.blockMin)} onchange={(e) => save({ blockMin: Number(e.currentTarget.value) })}>
			{#each [15, 30, 45, 60, 90] as m (m)}<option value={String(m)}>{m} min</option>{/each}
		</select>
		<span class="hint">For a single typed time, and when you drop or schedule an item on the timeline.</span>
	</label>
	<p class="hint">Visible hours now follow you to every device.</p>
</section>

<section class="card panel" aria-labelledby="pins-h">
	<h2 id="pins-h">Header pins</h2>
	<p class="hint">{pins.length} of 3 used. Pin a page from its page bar (Pin).</p>
	{#if pins.length}
		<ol class="pins">
			{#each pins as p, i (p.id)}
				<li>
					<a href="/pages/{p.id}">{p.title || 'Untitled'}</a>
					<button
						class="btn sm"
						type="button"
						aria-label="Move {p.title || 'Untitled'} up"
						disabled={i === 0}
						onclick={() => movePin(i, -1)}>↑</button
					>
					<button
						class="btn sm"
						type="button"
						aria-label="Move {p.title || 'Untitled'} down"
						disabled={i === pins.length - 1}
						onclick={() => movePin(i, 1)}>↓</button
					>
					<button
						class="btn sm"
						type="button"
						onclick={() =>
							setPins(
								pins.filter((x) => x.id !== p.id).map((x) => x.id),
								'Unpinned from header',
							)}>Unpin</button
					>
				</li>
			{/each}
		</ol>
	{/if}
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
	.pins {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pins li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.pins a {
		flex: 1;
		min-width: 0;
		color: var(--ink);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
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
	.times {
		gap: 16px;
		margin-top: 8px;
	}
	input[type='radio'] {
		width: 16px;
		height: 16px;
		accent-color: var(--ink);
	}
</style>
