<!-- Welcome tour (FEATURES §11): auto once per user (users.tour_state). One spotlight at a time, text beside it,
     Back/Next/Skip/Finish. A step whose target isn't on screen (phone vs PC, page without it) is skipped. Resize =
     reposition. Nothing behind is clickable while it runs, so nothing can get stuck half-way. -->
<script lang="ts">
	import { onMount, tick } from 'svelte';

	let { onend }: { onend: (state: 'done' | 'skipped') => void } = $props();
	type Step = { title: string; text: string; at?: string[] };
	const STEPS: Step[] = [
		{ title: 'Welcome to Life Tracker', text: 'A quick look around: 6 short steps. Skip any time; restart it from Settings › Help.' },
		{ title: 'Home', text: 'Your month on the left, the day planner on the right. Click a day to plan it.', at: ['.hdr nav a[href="/"]', '.mbar a[href="/today"]'] },
		{ title: 'Planner blocks', text: 'Drag on empty time to block it, then type a title. Every drag also has a button.', at: ['aside[aria-label="Daily planner"]', '.wheel'] },
		{ title: 'Quick add', text: 'Press N anywhere (or +) and type "dentist fri 3pm". It reads dates, times, /type and /remind.', at: ['.mbar .add', '.hdr [aria-label="Keyboard shortcuts"]'] },
		{ title: 'Keep', text: 'Quick notes and checklists, with labels, binders and reminders.', at: ['.hdr nav a[href="/keep"]', '.mbar a[href="/keep"]'] },
		{ title: 'Pages', text: 'Longer writing, linked pages and databases. Ctrl+K finds anything.', at: ['.hdr nav a[href="/pages"]', '.mbar a[href="/more"]'] },
		{ title: "You're set", text: 'That is it. Settings › Help has short guides if you need them.' },
	]; // prettier-ignore

	const visible = (sel: string) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		const r = el?.getBoundingClientRect();
		return el && r && r.width > 0 && r.height > 0 ? el : null;
	};
	const targetOf = (s: Step) => s.at?.map(visible).find(Boolean) ?? null;
	const usable = (s: Step) => !s.at || !!targetOf(s);

	let i = $state(0);
	let hole = $state<DOMRect | null>(null);
	let card: HTMLDivElement | undefined = $state();
	let pos = $state({ top: 0, left: 0 });
	const step = $derived(STEPS[i] as Step);
	const order = $derived(STEPS.map((s, n) => n).filter((n) => n === i || usable(STEPS[n] as Step)));
	const at = $derived(order.indexOf(i));

	async function place() {
		const el = targetOf(step);
		if (step.at && !el) return go(1); // target gone after a resize: move on, never freeze
		el?.scrollIntoView({ block: 'nearest' });
		hole = el?.getBoundingClientRect() ?? null;
		await tick();
		const w = card?.offsetWidth ?? 320;
		const h = card?.offsetHeight ?? 160;
		const vw = innerWidth;
		const vh = innerHeight;
		if (!hole) pos = { top: Math.max(16, (vh - h) / 2), left: Math.max(16, (vw - w) / 2) };
		else {
			const below = hole.bottom + 12 + h < vh;
			pos = {
				top: below ? hole.bottom + 12 : Math.max(16, hole.top - 12 - h),
				left: Math.min(Math.max(16, hole.left), vw - w - 16),
			};
		}
		card?.focus();
	}
	function go(d: 1 | -1) {
		let n = i + d;
		while (n >= 0 && n < STEPS.length && !usable(STEPS[n] as Step)) n += d;
		if (n >= STEPS.length) return onend('done');
		if (n < 0) return;
		i = n;
		void place();
	}
	onMount(() => {
		void place();
		const r = () => void place();
		addEventListener('resize', r);
		return () => removeEventListener('resize', r);
	});
	const last = $derived(at === order.length - 1);
</script>

<div class="block" role="presentation"></div>
{#if hole}<div
		class="hole"
		style:top="{hole.top - 6}px"
		style:left="{hole.left - 6}px"
		style:width="{hole.width + 12}px"
		style:height="{hole.height + 12}px"
	></div>{:else}<div class="dim"></div>{/if}
<div
	class="tcard card"
	role="dialog"
	aria-modal="true"
	aria-labelledby="tour-h"
	tabindex="-1"
	bind:this={card}
	style:top="{pos.top}px"
	style:left="{pos.left}px"
	onkeydown={(e) => e.key === 'Escape' && onend('skipped')}
>
	<span class="hint">{at + 1} of {order.length}</span>
	<h2 id="tour-h">{step.title}</h2>
	<p>{step.text}</p>
	<div class="row">
		{#if !last}<button class="btn sm ghost" type="button" onclick={() => onend('skipped')}>Skip tour</button
			>{/if}
		<span class="sp"></span>
		{#if at > 0}<button class="btn sm" type="button" onclick={() => go(-1)}>Back</button>{/if}
		<button class="btn sm primary" type="button" onclick={() => (last ? onend('done') : go(1))}
			>{last ? 'Finish' : 'Next'}</button
		>
	</div>
</div>

<style>
	.block {
		position: fixed;
		inset: 0;
		z-index: 200;
	}
	.dim {
		position: fixed;
		inset: 0;
		z-index: 201;
		background: rgb(0 0 0 / 0.55);
		pointer-events: none;
	}
	.hole {
		position: fixed;
		z-index: 201;
		border-radius: 12px;
		box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55);
		outline: 2px solid var(--accent);
		pointer-events: none;
		transition:
			top 0.2s,
			left 0.2s,
			width 0.2s,
			height 0.2s;
	}
	.tcard {
		position: fixed;
		z-index: 202;
		width: min(320px, calc(100vw - 32px));
		padding: 16px;
		outline: none;
	}
	h2 {
		margin: 4px 0;
		font-size: 17px;
	}
	p {
		margin: 0 0 12px;
		font-size: 14px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.sp {
		flex: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.hole {
			transition: none;
		}
	}
</style>
