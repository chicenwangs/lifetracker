<!-- Phone Week (FEATURES §10): read-first agenda, one row per day. Tap a day = that day's Today; tap an item = its page.
     Planning (drag, resize) stays on the PC. -->
<script lang="ts">
	import { shown } from '$lib/client/itemtypes.svelte';
	import { entryColors } from '$lib/client/partner';
	import { addDays, prettyDate, utcToLocal } from '$lib/time';
	import type { BlockDTO, CalendarPayload, ItemDTO } from '$lib/types';

	let {
		from,
		to,
		today,
		tz,
		cal,
	}: { from: string; to: string; today: string; tz: string; cal: CalendarPayload } = $props();

	type Row = { key: string; time: string; label: string; href: string | null; x: ItemDTO | BlockDTO };
	const days = $derived.by(() => {
		const out: { date: string; rows: Row[] }[] = [];
		for (let d = from; d < to; d = addDays(d, 1)) {
			const rows: Row[] = [];
			for (const i of shown(cal.items))
				if (i.date && i.date <= d && (i.endDate ?? i.date) >= d)
					rows.push({ key: i.id, time: i.date === d ? (i.time ?? '') : '', label: i.title, href: i.editable && !i.theirs ? `/item/${i.id}` : null, x: i }); // prettier-ignore
			for (const b of shown(cal.blocks)) {
				const s = utcToLocal(b.startAt, tz);
				if (s.date === d)
					rows.push({ key: b.id, time: s.time, label: b.label, href: b.itemId && !b.theirs ? `/item/${b.itemId}` : null, x: b }); // prettier-ignore
			}
			rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
			out.push({ date: d, rows });
		}
		return out;
	});
</script>

<div class="pweek">
	{#each days as d (d.date)}
		<section class="day card" class:today={d.date === today}>
			<a class="hd" href="/today?d={d.date}">{prettyDate(d.date).replace(/ \d{4}$/, '')}</a>
			{#each d.rows as r (r.key)}
				{@const c = entryColors(r.x)}
				<svelte:element
					this={r.href ? 'a' : 'div'}
					href={r.href}
					class="row"
					class:theirs={r.x.theirs}
					style:--bg={c.bg}
					style:--fg={c.ink}
				>
					<span class="tm">{r.time || 'all day'}</span>
					<span class="lb">{r.x.busy ? 'Busy' : r.label}</span>
					{#if r.x.theirs}<span class="who" style:background={r.x.owner?.color}>{r.x.owner?.initial}</span
						>{/if}
				</svelte:element>
			{:else}<span class="hint">Nothing planned</span>{/each}
		</section>
	{/each}
</div>

<style>
	.pweek {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.day {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.day.today {
		outline: 2px solid var(--accent);
	}
	.hd {
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		min-height: 28px;
		display: flex;
		align-items: center;
	}
	.row {
		display: flex;
		gap: 10px;
		align-items: center;
		min-height: 36px;
		padding: 0 10px;
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		text-decoration: none;
		font-size: 14px;
	}
	.row.theirs {
		background: repeating-linear-gradient(135deg, var(--bg) 0 6px, transparent 6px 10px);
		color: var(--ink);
	}
	.tm {
		width: 52px;
		flex: none;
		font-size: 12px;
	}
	.lb {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: #fff;
		font-size: 11px;
		display: grid;
		place-items: center;
	}
</style>
