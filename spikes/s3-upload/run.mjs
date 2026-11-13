// S-3: upload streaming (DESIGN §12). Run: npm run s3   (needs `npm ci` in ../app: uses SvelteKit's own request code)
// server.mjs (own process) uses the SAME request code adapter-node runs in production, so limits behave as in the app.
// An early refusal (413/400) can reach the client as a dropped connection (status 0 here): the server answers and
// closes while the client is still sending. Both count as "refused"; the UI must check size before it uploads.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, promises as fsp, readdirSync, rmSync } from 'node:fs';
import { fork } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { check, finish } from '../lib/harness.mjs';
import { moveInto } from './store.mjs';

const MB = 1024 * 1024;
const MAX_UPLOAD = 25 * MB; // D-12 recommendation
const dir = mkdtempSync(join(tmpdir(), 'lt-s3-'));
const tmpFiles = () => (existsSync(join(dir, '.tmp')) ? readdirSync(join(dir, '.tmp')) : []);
const refused = (r, status) => r.status === status || r.status === 0;

/** start server.mjs in its own process; resolves to { port, close } */
function serve(bodySizeLimit, maxBytes = MAX_UPLOAD) {
	const child = fork(
		new URL('./server.mjs', import.meta.url),
		[dir, String(bodySizeLimit), String(maxBytes)],
		{ execArgv: ['--expose-gc'] },
	);
	return new Promise((ok) => child.once('message', (port) => ok({ port, close: () => child.kill() })));
}

/** n bytes as a stream of 64 KB chunks (the test never holds the file in memory either) */
function stream(n, onChunk) {
	const chunk = Buffer.alloc(64 * 1024, 7);
	const hash = createHash('sha256');
	let left = n;
	const body = new Readable({
		read() {
			if (left <= 0) return this.push(null);
			const c = left >= chunk.length ? chunk : chunk.subarray(0, left);
			left -= c.length;
			hash.update(c);
			onChunk?.(n - left, this);
			this.push(c);
		},
	});
	return { body: Readable.toWeb(body), sha: () => hash.digest('hex') };
}
const post = (server, body, headers = {}) =>
	fetch(`http://127.0.0.1:${server.port}/`, {
		method: 'POST',
		body,
		duplex: 'half',
		headers: { 'content-type': 'application/octet-stream', ...headers },
	}).catch((e) => ({ status: 0, text: async () => e.cause?.code ?? e.message }));

// --- 1 default adapter-node limit (512K) blocks any real upload
let server = await serve(512 * 1024);
let r = await post(server, stream(2 * MB).body, { 'content-length': String(2 * MB) });
check(
	'default BODY_SIZE_LIMIT (512K) refuses a 2 MB upload',
	refused(r, 413) && tmpFiles().length === 0,
	`HTTP ${r.status}`,
);
server.close();

// --- 2 raised limit: 25 MB streams to disk
server = await serve(26 * MB);
const up = stream(MAX_UPLOAD);
r = await post(server, up.body, { 'content-length': String(MAX_UPLOAD) });
const saved = r.status === 201 ? await r.json() : {};
const peak = Number(await (await fetch(`http://127.0.0.1:${server.port}/peak`)).text());
const onDisk = saved.path ? (await fsp.stat(saved.path)).size : 0;
check(
	'25 MB upload accepted and complete',
	r.status === 201 && onDisk === MAX_UPLOAD,
	`HTTP ${r.status}, ${onDisk} bytes${r.status ? '' : ' ' + (await r.text())}`,
);
check('sha256 computed while streaming matches', saved.sha256 === up.sha());
// streamed or buffered? If buffered, memory would grow with the file. Send 4x the size and compare.
const big = await serve(101 * MB, 100 * MB);
const r100 = await post(big, stream(100 * MB).body, { 'content-length': String(100 * MB) });
const peak100 = Number(await (await fetch(`http://127.0.0.1:${big.port}/peak`)).text());
big.close();
check(
	'streamed, not buffered: memory in use stays small and does not grow with the file (< 8 MB)',
	r100.status === 201 && peak < 8 * MB && peak100 < 8 * MB,
	`25 MB file: ${(peak / MB).toFixed(1)} MB peak · 100 MB file: ${(peak100 / MB).toFixed(1)} MB peak`,
);
check(
	'stored as <2-char>/<key>, tmp folder empty',
	saved.path?.includes(join(saved.key.slice(0, 2), saved.key)) && tmpFiles().length === 0,
);

// --- 3 honest oversize: refused by content-length before a byte is stored
r = await post(server, stream(27 * MB).body, { 'content-length': String(27 * MB) });
check(
	'27 MB with content-length: 413, nothing left in tmp',
	refused(r, 413) && tmpFiles().length === 0,
	`HTTP ${r.status}`,
);

// --- 4 no content-length (chunked) and over our cap: our own byte counter stops it
r = await post(server, stream(MAX_UPLOAD + 64 * 1024).body);
check(
	'chunked upload over MAX_UPLOAD_BYTES: stopped mid-stream, tmp cleaned',
	(r.status === 413 || r.status === 0) && tmpFiles().length === 0,
	`HTTP ${r.status}`,
);

// --- 5 client drops the connection half way
const ac = new AbortController();
const half = stream(20 * MB, (sent) => sent > 10 * MB && ac.abort());
await fetch(`http://127.0.0.1:${server.port}/`, {
	method: 'POST',
	body: half.body,
	duplex: 'half',
	signal: ac.signal,
	headers: { 'content-type': 'application/octet-stream' },
}).catch(() => {});
await new Promise((ok) => setTimeout(ok, 300));
check('client abort half way: tmp cleaned', tmpFiles().length === 0, `${tmpFiles().length} files`);
// --- 5b SvelteKit drops the body when there is no Content-Type: must be a clean 400, not a crash
r = await fetch(`http://127.0.0.1:${server.port}/`, {
	method: 'POST',
	body: stream(MB).body,
	duplex: 'half',
}).catch(() => ({ status: 0 }));
check(
	'upload without Content-Type: refused, server still up',
	refused(r, 400) && (await fetch(`http://127.0.0.1:${server.port}/peak`)).ok,
	`HTTP ${r.status}`,
);
server.close();

// --- 6 EXDEV (tmp and target on different filesystems). One disk here, so the error is injected.
const a = join(dir, 'a.bin');
const b = join(dir, 'b.bin');
await fsp.writeFile(a, 'payload');
const crossDevice = { ...fsp, rename: async () => { throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }); } }; // prettier-ignore
await moveInto(a, b, crossDevice);
const moved = (await fsp.readFile(b, 'utf8')) === 'payload' && !(await fsp.stat(a).catch(() => null));
check('EXDEV on rename falls back to copy + delete', moved);
const denied = { ...fsp, rename: async () => { throw Object.assign(new Error('read-only file system'), { code: 'EROFS' }); } }; // prettier-ignore
check(
	'other rename errors (EROFS) are not swallowed',
	await moveInto(b, a, denied).then(
		() => false,
		(e) => e.code === 'EROFS',
	),
);

rmSync(dir, { recursive: true, force: true });
finish();
