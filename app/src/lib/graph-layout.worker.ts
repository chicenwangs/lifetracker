// Force layout off the main thread (ADR-007). Own module worker file: sigma's built-in worker starts from a blob: URL,
// which the app's CSP (script-src 'self') blocks. Runs a fixed number of steps, posting positions a few times a second,
// then stops (a settled graph costs no CPU).
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';

let run = 0;

self.onmessage = ({
	data,
}: MessageEvent<{ stop?: true; xy?: Float32Array; edges?: Uint32Array; steps?: number }>) => {
	const id = ++run; // a new message cancels the old run
	if (data.stop || !data.xy || !data.edges) return;
	const n = data.xy.length / 2;
	const g = new Graph({ type: 'undirected', multi: false });
	for (let i = 0; i < n; i++) g.addNode(i, { x: data.xy[i * 2], y: data.xy[i * 2 + 1] });
	for (let i = 0; i < data.edges.length; i += 2) {
		const [a, b] = [data.edges[i] as number, data.edges[i + 1] as number];
		if (a !== b && !g.hasEdge(a, b)) g.addEdge(a, b);
	}
	const settings = { ...forceAtlas2.inferSettings(g), barnesHutOptimize: n > 500, slowDown: 5 };
	const total = data.steps ?? 300;
	let done = 0;
	const step = () => {
		if (id !== run) return;
		const batch = Math.min(10, total - done);
		forceAtlas2.assign(g, { iterations: batch, settings });
		done += batch;
		const xy = new Float32Array(n * 2);
		g.forEachNode((k, a) => {
			xy[Number(k) * 2] = a.x as number;
			xy[Number(k) * 2 + 1] = a.y as number;
		});
		(self as unknown as Worker).postMessage({ xy, done: done >= total }, [xy.buffer]);
		if (done < total) setTimeout(step, 50);
	};
	step();
};
