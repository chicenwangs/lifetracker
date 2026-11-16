<!-- Live "what will be added" slots under every quick-add box (N palette, drag/day popups, phone Add sheet):
     each token you type lights up its slot; dashed = not typed (default). Owner 2026-11-16: same feedback everywhere. -->
<script lang="ts">
	import { typeName } from '$lib/client/itemtypes.svelte';
	import { colorsFor } from '$lib/colors';
	import { OFFSET_LABEL } from '$lib/remind';
	import { prettyDate, prettyTime } from '$lib/time';
	import type { QAParse, QATarget } from '$lib/quickadd';

	let { parsed, id, slot = false }: { parsed: QAParse; id?: string; slot?: boolean } = $props();

	const WHERE: Record<QATarget, string> = {
		planner: 'Planner',
		calendar: 'Calendar',
		both: 'Calendar + planner',
	};
	const shortDate = (d: string) => prettyDate(d).replace(/ \d{4}$/, '');
	const time = $derived.by(() => {
		const p = parsed;
		if (!p.time) return p.target === 'calendar' ? 'All day' : 'add a time';
		const s = prettyTime(p.time);
		return p.endTime ? `${s} – ${prettyTime(p.endTime)}${p.endNextDay ? ' (+1 day)' : ''}` : s;
	});
	const remind = (o: string) => (OFFSET_LABEL as Record<string, string>)[o] ?? o;
</script>

<div class="slots" {id}>
	{#if parsed.typeSet && parsed.type}
		{@const c = colorsFor(parsed.type)}
		<div class="s" style:background={c.bg} style:color={c.ink} style:border-color={c.bg}>
			<span class="k">Type</span><span class="v">{typeName(parsed.type)}</span>
		</div>
	{:else}
		<div class="s d"><span class="k">Type</span><span class="v">No type</span></div>
	{/if}
	<div class="s" class:d={!parsed.title}>
		<span class="k">Title</span><span class="v">{parsed.title || 'your words'}</span>
	</div>
	<div class="s" class:d={!parsed.targetSet}>
		<span class="k">Goes to</span>
		<span class="v">{WHERE[parsed.target]}{parsed.targetSet ? '' : ' · default'}</span>
	</div>
	<div class="s" class:d={!parsed.dateSet}>
		<span class="k">Day</span><span class="v"
			>{shortDate(parsed.date)}{parsed.dateSet ? '' : slot ? ' · dragged' : ' · default'}</span
		>
	</div>
	<div class="s" class:d={!parsed.time || parsed.fromSlot}>
		<span class="k">Time{parsed.notes.length ? ` · ${parsed.notes.join(', ')}` : ''}</span>
		<span class="v">{time}{parsed.fromSlot ? ' · dragged' : ''}</span>
	</div>
	<div class="s" class:d={!parsed.reminders.length}>
		<span class="k">Remind</span>
		<span class="v"
			>{parsed.reminders.length ? parsed.reminders.map(remind).join(', ') : 'none · /remind'}</span
		>
	</div>
</div>

<style>
	.slots {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
		gap: 6px;
		padding: 10px 16px;
		border-top: 1px solid var(--rule);
	}
	.s {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 4px 8px;
		font-size: 12px;
		min-width: 0;
	}
	.k {
		display: block;
		font-size: 11px;
		opacity: 0.8;
	}
	.v {
		display: block;
		overflow-wrap: anywhere;
		font-weight: 500;
	}
	.s.d {
		border-style: dashed;
	}
	.s.d .k,
	.s.d .v {
		color: var(--quiet);
		font-weight: 400;
	}
</style>
