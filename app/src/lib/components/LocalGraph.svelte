<!-- PR 21: the graph around one page (dialog body). Sigma is created only after the container has a real size, so
     the old "Container has no width" console error cannot happen; changing Depth rebuilds it. Tap a page to open it. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { get } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';
	import type SigmaT from 'sigma';
	import type { GraphDTO } from '$lib/types';

	let { around, onclose }: { around: { id: string; title: string }; onclose: () => void } = $props();
	let depth = $state<1 | 2>(2);
	let el: HTMLDivElement | undefined = $state();
	let loading = $state(true);
	let count = $state(0);
	let truncated = $state(false);
	// plain variables: sigma must not be reactive, and the explicit buttons below own the redraws
	let sigma: SigmaT | null = null;
	let gen = 0; // only the newest draw may assign sigma / counts (fast 1 then 2 must not race)

	async function draw() {
		if (!el) return;
		const my = ++gen;
		loading = true;
		try {
			const d = await get<GraphDTO>(`/api/graph?around=${encodeURIComponent(around.id)}&depth=${depth}`);
			// the dialog animates in: sigma measures the container, so wait until it has a size
			for (let i = 0; i < 60 && (!el || el.clientWidth < 20); i++)
				await new Promise((r) => requestAnimationFrame(r));
			if (!el || my !== gen) return;
			const [{ default: Graph }, { default: Sigma, DEFAULT_STYLES }] = await Promise.all([
				import('graphology'),
				import('sigma'),
			]);
			if (!el || my !== gen) return; // a newer draw owns the stage now: never kill or replace its Sigma
			sigma?.kill();
			sigma = null;
			const g = new Graph({ type: 'directed', multi: true });
			const css = getComputedStyle(el);
			const ink = css.getPropertyValue('--ink').trim() || '#00003d';
			const quiet = css.getPropertyValue('--quiet').trim() || '#9a98b8';
			const card = css.getPropertyValue('--card').trim() || '#ffffff';
			// hop distance from the page we are around: centre big, 1-hop medium, 2-hop small and faded
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain hop lookup during draw, never rendered
			const hop = new Map<string, number>([[around.id, 0]]);
			for (let pass = 0; pass <= depth; pass++)
				for (const e of d.edges) {
					const a = hop.get(e.source);
					const b = hop.get(e.target);
					if (a !== undefined && (b === undefined || b > a + 1)) hop.set(e.target, a + 1);
					if (b !== undefined && (a === undefined || a > b + 1)) hop.set(e.source, b + 1);
				}
			d.nodes.forEach((n, i) => {
				const h = hop.get(n.id) ?? depth + 1;
				g.addNode(n.id, {
					x: Math.cos(i) * Math.sqrt(i + 1),
					y: Math.sin(i) * Math.sqrt(i + 1),
					size: h === 0 ? 18 : h === 1 ? 10 : 6,
					label: `${n.icon ? `${n.icon} ` : ''}${n.title || 'Untitled'}${n.archived ? ' · archived' : ''}`,
					color: n.archived ? quiet : h === 0 ? ink : n.kind === 'record' || h === 1 ? '#3d5a80' : quiet,
				});
			});
			d.edges.forEach((e, i) =>
				g.addEdgeWithKey(`e${i}`, e.source, e.target, {
					size: e.relation === 'link' ? 1.6 : 1,
					color: e.relation === 'link' ? '#b84a44' : '#9a98b8',
				}),
			);
			sigma = new Sigma(g, el, {
				settings: { nodePickingPadding: 8, labelRenderedSizeThreshold: 0, itemSizesReference: 'screen' },
				styles: { nodes: { ...DEFAULT_STYLES.nodes, labelColor: ink, backdropColor: card } },
			});
			requestAnimationFrame(() => sigma?.resize()); // the dialog may have changed size since measuring
			const open = (node: string) => {
				onclose();
				void goto(`/pages/${node}`);
			};
			sigma.on('clickNode', ({ node }) => open(node));
			sigma.on('doubleClickNode', ({ node, event }) => {
				event.preventSigmaDefault();
				open(node);
			});
			if (my !== gen) return;
			count = d.nodes.length;
			truncated = d.truncated;
		} catch (e) {
			if (my === gen) showError(e);
		} finally {
			if (my === gen) loading = false;
		}
	}
	async function setDepth(d: 1 | 2) {
		if (d === depth) return;
		depth = d;
		await draw();
	}
	onMount(() => {
		void draw();
		const onResize = () => sigma?.resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			sigma?.kill();
			sigma = null;
		};
	});
</script>

<div class="lg">
	<header class="bar">
		<h2 title="Links around {around.title || 'Untitled'}">Links around {around.title || 'Untitled'}</h2>
		<div class="seg" role="group" aria-label="Depth">
			<button type="button" aria-pressed={depth === 1} onclick={() => setDepth(1)}>1</button>
			<button type="button" aria-pressed={depth === 2} onclick={() => setDepth(2)}>2</button>
		</div>
		<span class="hint" role="status"
			>{count} page{count === 1 ? '' : 's'}{truncated ? ' (more not shown)' : ''}</span
		>
		<span class="grow"></span>
		<a class="btn sm" href="/pages/graph" onclick={onclose}>Open full graph</a>
		<button type="button" class="btn sm" aria-label="Close the local graph" onclick={onclose}>✕</button>
	</header>
	<div
		class="canvas"
		bind:this={el}
		role="img"
		aria-label="Local graph around {around.title || 'Untitled'}"
	></div>
	{#if loading}
		<p class="hint pad">Loading…</p>
	{:else if count <= 1}
		<p class="hint pad">Nothing links to this page yet. Links from other pages show up here.</p>
	{/if}
	<p class="hint pad keys">Tap a page to open it. Depth 1 = direct links, 2 = links of links.</p>
</div>

<style>
	.lg {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--rule);
		flex: none;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.seg {
		display: flex;
		border: 1.5px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		flex: none;
	}
	.seg button {
		min-width: 40px;
		min-height: 32px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.seg button[aria-pressed='true'] {
		background: var(--pill);
		color: var(--pill-ink);
		font-weight: 600;
	}
	.canvas {
		flex: 1;
		min-height: 0;
		background: var(--card);
	}
	.grow {
		flex: 1;
	}
	.pad {
		padding: 0 12px 8px;
		margin: 0;
	}
	.keys {
		border-top: 1px solid var(--rule);
		padding-top: 6px;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.bar {
			flex-wrap: wrap;
			gap: 8px;
		}
		.seg button,
		.bar :global(.btn) {
			min-width: 48px;
			min-height: 48px;
		}
		.keys {
			display: none;
		}
	}
</style>
