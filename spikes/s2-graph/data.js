// Fake "second brain": clusters with a few hub pages, as compact arrays (the shape DESIGN §10 wants from the server).
// Seeded so every run draws the same graph.
export function makeGraph(n, m, seed = 7) {
	let s = seed;
	const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
	const clusters = Math.max(1, Math.round(n / 125));
	const edges = new Uint32Array(m * 2);
	const seen = new Set();
	let i = 0;
	while (i < m) {
		const a = Math.floor(rnd() * n);
		// 85% of links stay inside the cluster, 15% cross; low ids in a cluster act as hubs
		const same = rnd() < 0.85;
		const c = same ? a % clusters : Math.floor(rnd() * clusters);
		const b = c + clusters * Math.floor(rnd() ** 2 * Math.floor(n / clusters));
		const key = a < b ? a * n + b : b * n + a;
		if (a === b || b >= n || seen.has(key)) continue;
		seen.add(key);
		edges[i * 2] = a;
		edges[i * 2 + 1] = b;
		i++;
	}
	return { n, edges, clusters };
}
