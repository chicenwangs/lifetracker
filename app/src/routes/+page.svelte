<!-- HOME (FR-H1): month calendar 2/3 | planner 1/3 (due chips + planner + goals). < ~1000px stacks. -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import MonthCalendar from '$lib/components/MonthCalendar.svelte';
	import DayPlanner from '$lib/components/DayPlanner.svelte';
	import DueTodayChips from '$lib/components/DueTodayChips.svelte';
	import GoalsPanel from '$lib/components/GoalsPanel.svelte';
	import { patch, post } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { calendarBus } from '$lib/client/bus.svelte';
	import { nextStatus, type ItemDTO, type Status } from '$lib/types';
	import { prettyDate } from '$lib/time';
	import { without } from '$lib/client/obj';
	import { openItem } from '$lib/client/peek.svelte';
	import { removeItem } from '$lib/client/remove';

	let { data } = $props();
	let planner: DayPlanner | undefined = $state();

	// optimistic status overrides until refetch lands
	let statusOver = $state<Record<string, Status>>({});
	const monthItems = $derived(
		data.month_.items.map((i: ItemDTO) =>
			statusOver[i.id] ? { ...i, status: statusOver[i.id] as Status } : i,
		),
	);
	const plannerBlocks = $derived(
		data.planner.blocks.map((b) => (statusOver[b.id] ? { ...b, status: statusOver[b.id] as Status } : b)),
	);

	async function refresh() {
		await invalidateAll();
		statusOver = {};
	}

	function nav(params: Record<string, string>) {
		const u = new URL(page.url);
		for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
		goto(u, { keepFocus: true, noScroll: true, replaceState: true });
	}

	async function cycleItem(id: string) {
		const cur = monthItems.find((i) => i.id === id) ?? data.due.find((i) => i.id === id);
		if (cur) statusOver[id] = nextStatus(cur.status);
		try {
			await post(`/api/items/${id}/cycle`);
			await refresh();
		} catch (e) {
			statusOver = without(statusOver, id);
			showError(e);
		}
	}

	async function cycleBlock(id: string) {
		const cur = data.planner.blocks.find((b) => b.id === id);
		if (cur) statusOver[id] = nextStatus(cur.status);
		try {
			await post(`/api/blocks/${id}/cycle`);
			await refresh();
		} catch (e) {
			statusOver = without(statusOver, id);
			showError(e);
		}
	}

	async function moveItem(id: string, date: string, endDate: string | null) {
		const orig = data.month_.items.find((i) => i.id === id);
		try {
			await patch(`/api/items/${id}`, { date, endDate });
		} catch (e) {
			showError(e);
			throw e;
		}
		await refresh();
		if (orig?.date) {
			const back = { date: orig.date, endDate: orig.endDate };
			showToast(`Moved "${orig.title}" to ${prettyDate(date)}`, {
				undo: async () => {
					try {
						await patch(`/api/items/${id}`, back);
						await refresh();
					} catch (e) {
						showError(e);
					}
				},
			});
		}
	}

	function dropOut(id: string, x: number, y: number): boolean {
		const m = planner?.timeAt(x, y);
		if (m === null || m === undefined) return false;
		planner?.createLinked(id, m);
		return true;
	}

	// refetch: after quick add etc, every 60 s, on window focus
	$effect(() => {
		void calendarBus.version;
		untrack(() => {
			if (calendarBus.version > 0) refresh();
		});
	});
	onMount(() => {
		const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 60_000);
		const f = () => refresh();
		window.addEventListener('focus', f);
		return () => {
			clearInterval(t);
			window.removeEventListener('focus', f);
		};
	});
</script>

<svelte:head><title>Home · Life Tracker</title></svelte:head>

<main class="home">
	<div class="left">
		<MonthCalendar
			items={monthItems}
			year={data.year}
			month={data.month}
			today={data.today}
			selected={data.day}
			oncycle={cycleItem}
			onmove={moveItem}
			onopen={openItem}
			ondelete={(id) => removeItem(id, monthItems.find((i) => i.id === id)?.title ?? 'item', refresh)}
			onpick={(d) => nav({ d })}
			ondropout={dropOut}
			onnav={(y, m) => nav({ m: `${y}-${String(m).padStart(2, '0')}` })}
		/>
	</div>
	<aside class="right" aria-label="Daily planner">
		<DayPlanner
			bind:this={planner}
			date={data.day}
			tz={data.user?.timezone ?? 'Asia/Kuala_Lumpur'}
			blocks={plannerBlocks}
			onnav={(d) => nav({ d })}
			onchanged={refresh}
			oncycle={cycleBlock}
			onopenitem={openItem}
		>
			{#snippet top()}
				{#if data.planAhead}
					<p class="ahead" role="status">Today is wrapped up, so this is tomorrow. Plan away.</p>
				{/if}
				<DueTodayChips
					items={data.due}
					label={data.day === data.today ? 'Due today' : `Due ${prettyDate(data.day)}`}
				/>
			{/snippet}
		</DayPlanner>
		<GoalsPanel goals={data.goals} period={data.period} />
	</aside>
</main>

<style>
	.home {
		padding: 20px 24px;
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		align-items: flex-start;
	}
	.left {
		flex: 2 1 640px;
		min-width: 0;
	}
	.right {
		flex: 1 1 340px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: sticky;
		top: 84px;
	}
	.ahead {
		margin: 0;
		padding: 8px 16px;
		font-size: 12px;
		color: var(--quiet);
		border-bottom: 1px solid var(--rule);
	}
	@media (max-width: 1000px) {
		.right {
			position: static;
		}
	}
</style>
