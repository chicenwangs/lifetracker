// S-3 upload server, run as its own process so its memory can be measured apart from the test client.
// Turns Node requests into web Requests with the SAME function adapter-node uses in production (getRequest + bodySizeLimit).
import { createServer } from 'node:http';
import { getRequest } from '../../app/node_modules/@sveltejs/kit/src/exports/node/index.js';
import { NoBody, saveUpload, TooLarge } from './store.mjs';

const [dir, limit, maxBytes] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const mem = () => process.memoryUsage().arrayBuffers + process.memoryUsage().external;
const base = mem();
let peak = base;
// with --expose-gc: collect first, so the number is memory still IN USE (not chunks waiting for the GC)
setInterval(() => (globalThis.gc?.(), (peak = Math.max(peak, mem()))), 10).unref();

const server = createServer(async (req, res) => {
	if (req.url === '/peak') return res.end(String(peak - base));
	try {
		const request = await getRequest({ request: req, base: 'http://localhost', bodySizeLimit: limit });
		const saved = await saveUpload(request.body, { dir, maxBytes });
		res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(saved));
	} catch (e) {
		const status = e instanceof TooLarge || e.status === 413 ? 413 : e instanceof NoBody ? 400 : 500;
		if (status === 500 && e.code !== 'ECONNRESET') console.error('server:', e); // client abort is expected
		if (!res.headersSent) res.writeHead(status, { connection: 'close' });
		res.end(e.message);
	}
});
server.listen(0, '127.0.0.1', () => process.send(server.address().port));
