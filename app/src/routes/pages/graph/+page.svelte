<!-- Knowledge graph (FEATURES PG-GRAPH, ADR-007): sigma (WebGL) + own layout worker. Read-only: dragging a node only
     moves it on screen. Archived pages drawn grey + "archived", with a toggle. Keyboard: list view, or arrows on the graph. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type GraphT from 'graphology';
	import type SigmaT from 'sigma';
	import type { GraphDTO } from '$lib/types';

	let { data } = $props();
	const g0 = $derived(data.graph as GraphDTO);
	let el: HTMLDivElement | undefined = $state();
	let showLinks = $state(true);
	let showParents = $state(true);
	let showArchived = $state(true);
	let around = $state(false);
	let list = $state(false);
	let selected = $state<string | null>(null);
	let sigma: SigmaT | null = null;
	let graph: GraphT | null = null;
	const archivedCount = $derived(g0.nodes.filter((n) => n.archived).length);
	const byId = $derived(new Map(g0.nodes.map((n) => [n.id, n])));
	const title = (id: string) => byId.get(id)?.title || 'Untitled';
	const near = $derived.by(() => {
		if (!around || !selected) return null;
		const s = new Set([selected]);
		for (const e of g0.edges) {
			if (e.source === selected) s.add(e.target);
			if (e.target === selected) s.add(e.source);
		}
		return s;
	});
	const visible = (id: string) => {
		const n = byId.get(id);
		return !!n && (showArchived || !n.archived) && (!near || near.has(id));
	};
	const sel = $derived(selected ? byId.get(selected) : undefined);
	const rel = $derived.by(() => {
		if (!selected) return null;
		const of = (f: (e: GraphDTO['edges'][number]) => string | null) => [...new Set(g0.edges.map(f).filter((x): x is string => !!x))]; // prettier-ignore
		return {
			children: of((e) => (e.relation === 'parent' && e.source === selected ? e.target : null)),
			linksTo: of((e) => (e.relation === 'link' && e.source === selected ? e.target : null)),
			linkedFrom: of((e) => (e.relation === 'link' && e.target === selected ? e.source : null)),
		};
	});

	function refresh() {
		sigma?.refresh({ skipIndexation: true });
	}
	$effect(() => {
		void [showLinks, showParents, showArchived, around, selected];
		refresh();
	});
	function select(id: string | null) {
		selected = id;
		const p = id && sigma?.getNodeDisplayData(id);
		if (p) sigma?.getCamera().animate({ x: p.x, y: p.y }, { duration: 200 });
	}

	onMount(() => {
		list = matchMedia('(max-width: 699px)').matches; // phone: the list is the graph (DESIGN §10 fallback)
		let worker: Worker | null = null;
		let dead = false;
		void (async () => {
			const [{ default: Graph }, { default: Sigma }] = await Promise.all([
				import('graphology'),
				import('sigma'),
			]);
			if (dead || !el) return;
			const g = new Graph({ type: 'directed', multi: true });
			const idx = new Map<string, number>();
			g0.nodes.forEach((n, i) => {
				idx.set(n.id, i);
				const deg = g0.edges.filter((e) => e.source === n.id || e.target === n.id).length;
				g.addNode(n.id, {
					x: Math.cos(i) * Math.sqrt(i + 1),
					y: Math.sin(i) * Math.sqrt(i + 1),
					size: 4 + Math.min(10, Math.sqrt(deg) * 2),
					label: (n.title || 'Untitled') + (n.archived ? ' · archived' : ''),
					color: n.archived ? '#9a98b8' : n.kind === 'record' ? '#3d5a80' : '#00003d',
				});
			});
			g0.edges.forEach((e, i) => g.addEdgeWithKey(`e${i}`, e.source, e.target, { relation: e.relation, size: e.relation === 'link' ? 1.5 : 1, color: e.relation === 'link' ? '#b84a44' : '#9a98b8' })); // prettier-ignore
			graph = g;
			sigma = new Sigma(g, el, {
				// small nodes stay clickable when zoomed out (ADR-007)
				settings: { nodePickingPadding: 6, labelRenderedSizeThreshold: 7 },
				nodeReducer: (k, a) => {
					if (!visible(k)) return { ...a, hidden: true };
					if (k === selected)
						return { ...a, color: '#f3d053', size: (a.size as number) + 4, forceLabel: true, zIndex: 1 };
					return a;
				},
				edgeReducer: (_k, a, attrs) =>
					(attrs.relation === 'link' && !showLinks) || (attrs.relation === 'parent' && !showParents)
						? { ...a, hidden: true }
						: a,
			});
			sigma.on('clickNode', ({ node }) => select(node));
			sigma.on('doubleClickNode', ({ node, event }) => {
				event.preventSigmaDefault();
				void goto(`/pages/${node}`);
			});
			sigma.on('clickStage', () => select(null));
			// drag = layout only, never a data change (PAGE-019)
			let dragging: string | null = null;
			sigma.on('downNode', ({ node }) => (dragging = node));
			sigma.getMouseCaptor().on('mousemovebody', (e) => {
				if (!dragging || !sigma) return;
				const p = sigma.viewportToGraph(e);
				g.mergeNodeAttributes(dragging, { x: p.x, y: p.y });
				e.preventSigmaDefault();
				e.original.preventDefault();
			});
			sigma.getMouseCaptor().on('mouseup', () => (dragging = null));

			// layout in the worker; positions applied a few times a second, then it stops
			worker = new Worker(new URL('$lib/graph-layout.worker.ts', import.meta.url), { type: 'module' });
			worker.onmessage = ({ data: m }: MessageEvent<{ xy: Float32Array }>) =>
				g.updateEachNodeAttributes((k, a) => ({ ...a, x: m.xy[(idx.get(k) ?? 0) * 2], y: m.xy[(idx.get(k) ?? 0) * 2 + 1] }), { attributes: ['x', 'y'] }); // prettier-ignore
			const xy = new Float32Array(g0.nodes.length * 2);
			g0.nodes.forEach(
				(n, i) => (
					(xy[i * 2] = g.getNodeAttribute(n.id, 'x')),
					(xy[i * 2 + 1] = g.getNodeAttribute(n.id, 'y'))
				),
			);
			const edges = new Uint32Array(
				g0.edges.flatMap((e) => [idx.get(e.source) ?? 0, idx.get(e.target) ?? 0]),
			);
			worker.postMessage({ xy, edges, steps: g0.nodes.length > 2000 ? 150 : 300 }, [xy.buffer, edges.buffer]);
		})();
		return () => {
			dead = true;
			worker?.terminate();
			sigma?.kill();
			sigma = null;
		};
	});

	/** arrows walk to the linked page in that direction (keyboard path, ADR-007) */
	function onKey(e: KeyboardEvent) {
		const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
		if (e.key === 'Enter' && selected) return void goto(`/pages/${selected}`);
		if (!dir || !graph) return;
		e.preventDefault();
		const first = g0.nodes.find((n) => visible(n.id));
		if (!selected) return select(first?.id ?? null);
		const from = graph.getNodeAttributes(selected);
		let best: string | null = null;
		let score = 0;
		graph.forEachNeighbor(selected, (k, a) => {
			if (!visible(k)) return;
			const dx = (a.x as number) - (from.x as number);
			const dy = (a.y as number) - (from.y as number);
			const s = (dx * (dir[0] as number) + dy * (dir[1] as number)) / (Math.hypot(dx, dy) || 1);
			if (s > score) [best, score] = [k, s];
		});
		if (best) select(best);
	}
	const cam = (f: 'in' | 'out' | 'fit') => {
		const c = sigma?.getCamera();
		if (!c) return;
		if (f === 'fit') void c.reset({ duration: 200 });
		else void (f === 'in' ? c.zoomIn({ duration: 200 }) : c.zoomOut({ duration: 200 }));
	};
</script>

<svelte:head><title>Graph · Pages · Life Tracker</title></svelte:head>

<section class="card panel gv">
	<div class="top">
		<h1>Knowledge graph</h1>
		<fieldset class="show">
			<legend class="label">Show</legend>
			<label><input type="checkbox" bind:checked={showLinks} /> <span class="sw link"></span>Page links</label
			>
			<label
				><input type="checkbox" bind:checked={showParents} /> <span class="sw par"></span>Parent / child</label
			>
			<label
				><input type="checkbox" bind:checked={showArchived} /> <span class="sw arch"></span>Archived pages ({archivedCount})</label
			>
		</fieldset>
		<label class="scope"
			>Scope <select aria-label="Scope" bind:value={around}>
				<option value={false}>Whole workspace</option>
				<option value={true} disabled={!selected}
					>Around {sel ? sel.title || 'Untitled' : 'the selected page'}</option
				>
			</select></label
		>
		<button class="btn sm" type="button" aria-pressed={list} onclick={() => (list = !list)}
			>{list ? 'Show graph' : 'Show as list instead'}</button
		>
	</div>
	{#if g0.truncated}<p class="hint">
			Showing your {g0.nodes.length} most recently opened pages. Use Around a page to see one area.
		</p>{/if}
	{#if !g0.nodes.length}
		<p class="hint">No pages yet. Pages and the links between them show up here.</p>
	{:else}
		<div class="body">
			<div class="stage" class:hidden={list}>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<div
					class="canvas"
					bind:this={el}
					tabindex="0"
					role="application"
					aria-label="Graph. Arrow keys move between linked pages, Enter opens."
					onkeydown={onKey}
				></div>
				<div class="zoom">
					<button class="btn sm" type="button" aria-label="Zoom in" onclick={() => cam('in')}>+</button>
					<button class="btn sm" type="button" aria-label="Zoom out" onclick={() => cam('out')}>−</button>
					<button class="btn sm" type="button" aria-label="Fit graph to view" onclick={() => cam('fit')}
						>Fit</button
					>
				</div>
				<p class="hint legend">
					Click a page to select, double-click to open. Dragging only moves it on screen.
				</p>
			</div>
			{#if list}
				<ul class="list" aria-label="Pages and their links">
					{#each g0.nodes.filter((n) => visible(n.id)) as n (n.id)}
						{@const out = g0.edges.filter((e) => e.source === n.id && e.relation === 'link').length}
						{@const inn = g0.edges.filter((e) => e.target === n.id && e.relation === 'link').length}
						<li>
							<a href="/pages/{n.id}" class:arch={n.archived}>{n.title || 'Untitled'}</a>
							<span class="hint"
								>{n.archived ? 'archived · ' : ''}{out} links out · {inn} in{n.parentId
									? ` · in ${title(n.parentId)}`
									: ''}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if sel && rel && !list}
				<aside class="sel card" aria-label="Selected page">
					<span class="label">Selected</span>
					<b>{sel.title || 'Untitled'}</b>{#if sel.archived}<span class="hint">Archived page</span>{/if}
					{#if sel.parentId}<span class="hint"
							>Parent: <a href="/pages/{sel.parentId}">{title(sel.parentId)}</a></span
						>{/if}
					{#each [['Children', rel.children], ['Links to', rel.linksTo], ['Linked from', rel.linkedFrom]] as const as [h, ids] (h)}
						{#if ids.length}
							<span class="label">{h}</span>
							{#each ids as i (i)}<button type="button" class="lnk" onclick={() => select(i)}
									>{title(i)}</button
								>{/each}
						{/if}
					{/each}
					<a class="btn sm primary" href="/pages/{sel.id}">Open page</a>
				</aside>
			{/if}
		</div>
	{/if}
</section>

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 20px;
		align-items: center;
	}
	.top h1 {
		margin: 0;
		font-size: 22px;
	}
	.show {
		display: flex;
		gap: 12px;
		border: 0;
		padding: 0;
		margin: 0;
		font-size: 13px;
		flex-wrap: wrap;
	}
	.show legend {
		float: left;
		margin-right: 4px;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 3px;
		vertical-align: middle;
		margin-right: 4px;
	}
	.sw.link {
		background: #b84a44;
	}
	.sw.par {
		background: #9a98b8;
	}
	.sw.arch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1.5px dashed #9a98b8;
	}
	.body {
		display: flex;
		gap: 12px;
		margin-top: 12px;
	}
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.stage.hidden {
		display: none;
	}
	.canvas {
		height: 66vh;
		border-radius: 12px;
		border: 1.5px solid var(--rule);
		background: var(--card);
	}
	.canvas:focus-visible {
		outline: 3px solid var(--accent);
	}
	.zoom {
		position: absolute;
		top: 10px;
		right: 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.list {
		flex: 1;
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.list li {
		display: flex;
		flex-direction: column;
	}
	.list a {
		color: var(--ink);
	}
	.list a.arch {
		font-style: italic;
		opacity: 0.75;
	}
	.sel {
		width: 240px;
		flex: none;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-self: flex-start;
	}
	.lnk {
		text-align: left;
		background: none;
		border: 0;
		padding: 2px 0;
		color: var(--ink);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		min-height: 24px;
	}
	@media (max-width: 699px) {
		.sel {
			display: none;
		}
	}
</style>
