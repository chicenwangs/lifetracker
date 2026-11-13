// Force layout off the main thread. Our own module worker (same-origin file) instead of the library's
// built-in worker: that one starts from a blob: URL, which the app's CSP (script-src 'self') blocks.
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';

let running = false;

self.onmessage = ({ data }) => {
	if (data.stop) return void (running = false);
	const { n, edges, batch = 5 } = data;
	const graph = new Graph({ type: 'undirected' });
	for (let i = 0; i < n; i++)
		graph.addNode(i, { x: Math.cos(i) * Math.sqrt(i), y: Math.sin(i) * Math.sqrt(i) });
	for (let i = 0; i < edges.length; i += 2) graph.addEdge(edges[i], edges[i + 1]);
	const settings = { ...forceAtlas2.inferSettings(graph), barnesHutOptimize: true, slowDown: 5 };
	running = true;
	let iterations = 0;
	const step = () => {
		if (!running) return;
		const t = performance.now();
		forceAtlas2.assign(graph, { iterations: batch, settings });
		iterations += batch;
		const xy = new Float32Array(n * 2);
		graph.forEachNode((k, a) => {
			xy[k * 2] = a.x;
			xy[k * 2 + 1] = a.y;
		});
		self.postMessage({ xy, iterations, ms: performance.now() - t }, [xy.buffer]);
		setTimeout(step); // yield so a stop message can arrive
	};
	step();
};
