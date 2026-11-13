<!-- Reminders on one thing (FEATURES §9): list each (time + rule), add (offset before its time, or an exact time),
     remove one. Errors say what's wrong; nothing is guessed. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { del, get, post } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';
	import { OFFSET_LABEL, OFFSETS } from '$lib/remind';
	import type { ReminderDTO } from '$lib/types';

	let {
		source,
		sourceId,
		tz,
		relative = true,
	}: { source: 'planner_item' | 'planner_block' | 'keep_note' | 'database_record'; sourceId: string; tz: string; relative?: boolean } = $props(); // prettier-ignore
	let list = $state<ReminderDTO[]>([]);
	let offset = $state<string>('1d');
	let at = $state('');
	let err = $state('');
	const load = async () => (list = (await get<{ reminders: ReminderDTO[] }>(`/api/reminders?source=${source}&id=${sourceId}`)).reminders); // prettier-ignore
	onMount(() => void load().catch(showError));
	const fmt = (z: string | null) =>
		z ? new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(z)) : '—'; // prettier-ignore
	async function add(body: Record<string, string>) {
		err = '';
		try {
			await post('/api/reminders', { source, sourceId, ...body });
			at = '';
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not add the reminder.';
		}
	}
	async function remove(id: string) {
		try {
			await del(`/api/reminders/${id}`);
			await load();
		} catch (e) {
			showError(e);
		}
	}
	/** datetime-local is in the browser's zone; the user's tz may differ, so convert from the user's tz explicitly */
	function exact() {
		if (!at) return;
		const [d, t] = at.split('T');
		const guess = Date.parse(`${d}T${t}:00Z`);
		const off = (Date.parse(new Date(guess).toLocaleString('en-US', { timeZone: tz })) - Date.parse(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }))); // prettier-ignore
		void add({ at: new Date(guess - off).toISOString().slice(0, 19) + 'Z' });
	}
</script>

<div class="rem">
	<span class="label">Reminders</span>
	{#each list as r (r.id)}
		<div class="row">
			<span
				>⏰ {fmt(r.dueAt)}{#if r.offset}
					· {r.offset.replace(/ (\w+)$/, (_, u) => ` ${u}${r.offset?.startsWith('1 ') ? '' : 's'}`)} before{/if}</span
			>
			<span class="hint">{r.status === 'scheduled' ? '' : r.status}</span>
			<button
				class="mini"
				type="button"
				aria-label="Remove reminder {fmt(r.dueAt)}"
				onclick={() => remove(r.id)}>×</button
			>
		</div>
	{:else}<span class="hint">None yet.</span>{/each}
	<div class="row add">
		{#if relative}
			<select aria-label="When" bind:value={offset}>
				{#each OFFSETS as o (o)}<option value={o}>{OFFSET_LABEL[o]}</option>{/each}
			</select>
			<button class="btn sm" type="button" onclick={() => add({ offset })}>Add</button>
			<span class="hint">or</span>
		{/if}
		<input type="datetime-local" aria-label="Exact reminder time" bind:value={at} />
		<button class="btn sm" type="button" disabled={!at} onclick={exact}>Add at time</button>
	</div>
	{#if err}<span class="alert" role="alert">{err}</span>{/if}
</div>

<style>
	.rem {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.row > span:first-child {
		flex: 1;
	}
	.add > span:first-child {
		flex: none;
	}
	.mini {
		min-width: 24px;
		min-height: 24px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
</style>
