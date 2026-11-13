<script>
	import { onMount } from 'svelte';
	import GraphData from 'graphology';
	import Sigma from 'sigma';
	import { makeGraph } from './data.js';

	let { nodes, edges } = $props();
	let el;
	let selected = $state(null);
	let iterations = $state(0);

	onMount(() => {
		const data = makeGraph(nodes, edges);
		const graph = new GraphData({ type: 'undirected' });
		for (let i = 0; i < data.n; i++)
			graph.addNode(i, {
				x: Math.cos(i) * Math.sqrt(i),
				y: Math.sin(i) * Math.sqrt(i),
				size: 3,
				label: `Page ${i}`,
				color: `hsl(${((i % data.clusters) * 47) % 360} 55% 50%)`,
			});
		for (let i = 0; i < data.edges.length; i += 2) graph.addEdge(data.edges[i], data.edges[i + 1]);

		const sigma = new Sigma(graph, el, {
			// selection drawn by a reducer: no graph mutation, so picking a node is one cheap refresh
			nodeReducer: (k, a) =>
				String(selected) === k ? { ...a, size: 9, color: '#f3d053', zIndex: 1, forceLabel: true } : a,
			labelRenderedSizeThreshold: 8,
		});

		const worker = new Worker(new URL('./layout.worker.js', import.meta.url), { type: 'module' });
		const stats = { applyMs: [], workerMs: [] };
		worker.onmessage = ({ data: m }) => {
			const t = performance.now();
			graph.updateEachNodeAttributes(
				(k, a) => {
					a.x = m.xy[k * 2];
					a.y = m.xy[k * 2 + 1];
					return a;
				},
				{ attributes: ['x', 'y'] },
			);
			stats.applyMs.push(performance.now() - t);
			stats.workerMs.push(m.ms);
			iterations = m.iterations;
		};
		worker.postMessage({ n: data.n, edges: data.edges });

		const select = (k) => {
			const nodes = [selected, k].filter((x) => x !== null).map(String);
			selected = k;
			// only the two nodes that changed: a full refresh re-processes all 25k elements (~107 ms measured)
			sigma.refresh({ partialGraph: { nodes }, skipIndexation: true });
			const p = sigma.getNodeDisplayData(k);
			if (p) sigma.getCamera().animate({ x: p.x, y: p.y }, { duration: 150 });
		};
		sigma.on('clickNode', ({ node }) => select(Number(node)));

		// keyboard path (CLAUDE.md: every pointer action has one): arrows walk to the nearest neighbour in that direction
		function onKey(e) {
			const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
			if (!dir) return;
			e.preventDefault();
			if (selected === null) return select(0);
			const from = graph.getNodeAttributes(selected);
			let best = null;
			let bestScore = 0;
			graph.forEachNeighbor(selected, (k, a) => {
				const dx = a.x - from.x;
				const dy = a.y - from.y;
				const score = (dx * dir[0] + dy * dir[1]) / Math.hypot(dx, dy);
				if (score > bestScore) [best, bestScore] = [k, score];
			});
			if (best !== null) select(Number(best));
		}
		el.addEventListener('keydown', onKey);

		Object.assign(window, {
			__g: { graph, sigma, stats, stop: () => worker.postMessage({ stop: true }), selected: () => selected },
		});
		return () => {
			worker.terminate();
			el.removeEventListener('keydown', onKey);
			sigma.kill();
		};
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	id="graph"
	bind:this={el}
	tabindex="0"
	role="application"
	aria-label="Page graph. Arrow keys move between linked pages."
></div>
<p id="hud" style="position:fixed;top:4px;left:8px;margin:0">
	layout step {iterations} · selected {selected ?? 'none'}
</p>
