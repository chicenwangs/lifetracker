// S-2: graph renderer at 5k nodes / 20k edges (DESIGN §10). Run: npm run s2
// Opens a real browser window: headless Chrome gave frame times ~10x worse (366 ms vs 35 ms), so its numbers are useless.
import { check, finish, withPage } from '../lib/harness.mjs';

const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const r1 = (x) => Math.round(x * 10) / 10;
const report = (f) => `p50 ${r1(pct(f, 0.5))} ms, p95 ${r1(pct(f, 0.95))} ms, worst ${r1(Math.max(...f))} ms`;

/** frame gaps (ms) over n frames; move = also move + zoom the camera every frame */
const frames = (page, n, move) =>
	page.evaluate(
		([n, move]) =>
			new Promise((res) => {
				const cam = window.__g.sigma.getCamera();
				const gaps = [];
				let last = performance.now();
				let i = 0;
				const tick = (t) => {
					gaps.push(t - last);
					last = t;
					if (move)
						cam.setState({ x: 0.5 + Math.sin(i / 30) * 0.2, y: 0.5, ratio: 0.6 + Math.cos(i / 40) * 0.4 });
					if (++i < n) requestAnimationFrame(tick);
					else res(gaps.slice(1));
				};
				requestAnimationFrame(tick);
			}),
		[n, move],
	);

async function measure(n, e, extra, launch = { headless: false }) {
	await withPage(
		`/s2-graph/?n=${n}&e=${e}`,
		async (page, ctx) => {
			const csp = [];
			page.on('console', (m) => m.text().includes('Content Security Policy') && csp.push(m.text()));
			await page.waitForFunction(() => window.__g?.stats.applyMs.length > 0, null, { timeout: 60_000 });
			const size = await page.evaluate(() => [window.__g.graph.order, window.__g.graph.size]);
			check(`${n}/${e}: graph loaded`, size[0] === n && size[1] === e);

			const busy = await frames(page, 300, false);
			const st = await page.evaluate(() => window.__g.stats);
			check(
				`${n}/${e}: page responsive while the worker lays out (p95 < 50 ms)`,
				pct(busy, 0.95) < 50,
				report(busy),
			);
			console.log(
				`      worker ${r1(pct(st.workerMs, 0.5))} ms per 5 steps · applying positions on the main thread ${r1(pct(st.applyMs, 0.5))} ms`,
			);

			await page.waitForFunction(() => window.__g.stats.applyMs.length > 40, null, { timeout: 120_000 });
			await page.evaluate(() => window.__g.stop());
			await page.waitForTimeout(1000);
			return extra(page, { ...ctx, csp });
		},
		launch,
	);
}

let gpu = '';
// target size from DESIGN §10: must work
await measure(5000, 20000, async (page, { hosts, errors, csp }) => {
	gpu = await page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
	});
	const f = await frames(page, 180, true);
	check('5000/20000: pan + zoom usable (p95 frame < 50 ms = 20 fps)', pct(f, 0.95) < 50, report(f));

	// keyboard: focus the graph, arrows walk along links
	await page.focus('#graph');
	await page.keyboard.press('ArrowRight'); // nothing selected yet: first arrow picks a start node
	const walk = [await page.evaluate(() => window.__g.selected())];
	for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
		await page.keyboard.press(key);
		await page.waitForTimeout(250);
		walk.push(await page.evaluate(() => window.__g.selected()));
	}
	const linked = await page.evaluate(
		(w) => w.slice(1).every((k, i) => k === w[i] || window.__g.graph.areNeighbors(w[i], k)),
		walk,
	);
	check('arrow keys move the selection along links', new Set(walk).size > 1 && linked, walk.join(' -> '));

	const t = await page.evaluate(() => {
		const { sigma } = window.__g;
		const t0 = performance.now();
		for (let i = 0; i < 20; i++)
			sigma.refresh({ partialGraph: { nodes: ['1', '2'] }, skipIndexation: true, schedule: false });
		return (performance.now() - t0) / 20;
	});
	check('re-draw after a selection change < 16 ms', t < 16, `${r1(t)} ms`);

	check('runs under the app CSP (own worker file, no violations)', csp.length === 0, csp[0] ?? '');
	check(
		'no request left localhost',
		[...hosts].every((h) => h.startsWith('localhost')),
		[...hosts].join(),
	);
	check('no page errors', errors.length === 0, errors.join(' | '));
});
// mouse picking: headless on purpose (in a visible window the real pointer sends its own hover events)
await measure(
	300,
	600,
	async (page) => {
		// click: zoom in first (at full zoom-out a node is ~3 px, too small to hit; P5 needs nodePickingPadding)
		await page.evaluate(() =>
			window.__g.sigma.getCamera().setState({ x: 0.5, y: 0.5, ratio: 0.3, angle: 0 }),
		);
		await page.waitForTimeout(500);
		const hit = await page.evaluate(() => {
			const { sigma, graph } = window.__g;
			let best = null;
			let d = Infinity;
			graph.forEachNode((k, a) => {
				const p = sigma.graphToViewport(a);
				const dist = Math.hypot(p.x - 720, p.y - 450);
				if (dist < d) [best, d] = [{ k: Number(k), x: p.x, y: p.y }, dist];
			});
			return best;
		});
		await page.mouse.move(hit.x - 30, hit.y - 30);
		await page.mouse.move(hit.x, hit.y, { steps: 5 });
		await page.waitForTimeout(300); // picking reads the frame drawn after the hover: a click in the same frame misses
		await page.mouse.click(hit.x, hit.y);
		await page.waitForTimeout(400);
		const sel = await page.evaluate(() => window.__g.selected());
		check('clicking a node selects it', sel === hit.k, `clicked ${hit.k}, selected ${sel}`);
	},
	{},
);
// "smooth" size: where it must feel instant
await measure(2000, 8000, async (page) => {
	const f = await frames(page, 180, true);
	check('2000/8000: pan + zoom smooth (p95 frame < 25 ms)', pct(f, 0.95) < 25, report(f));
});
console.log(`\nGPU: ${gpu}`);
finish();
