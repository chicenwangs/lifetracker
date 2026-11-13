// Streamed upload store (DESIGN §12): tmp file INSIDE the upload dir -> count bytes + sha256 -> rename into place.
// Never buffers the file in memory. `fs` is a parameter only so the test can force EXDEV.
import { createHash, randomBytes } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class TooLarge extends Error {}
/** SvelteKit sets request.body = null when the request has no Content-Type (kit/src/exports/node) */
export class NoBody extends Error {}

/** rename, or copy + delete when tmp and target are on different filesystems (EXDEV) */
export async function moveInto(from, to, fs = nodeFs.promises) {
	try {
		await fs.rename(from, to);
	} catch (e) {
		if (e.code !== 'EXDEV') throw e;
		await fs.copyFile(from, to);
		await fs.unlink(from);
	}
}

/**
 * @param {ReadableStream<Uint8Array>} body web stream from `request.body`
 * @returns {Promise<{ key: string, bytes: number, sha256: string, path: string }>}
 */
export async function saveUpload(body, { dir, maxBytes, fs = nodeFs.promises }) {
	if (!body) throw new NoBody('no body (missing Content-Type?)');
	const tmpDir = join(dir, '.tmp');
	await nodeFs.promises.mkdir(tmpDir, { recursive: true });
	const key = randomBytes(16).toString('hex');
	const tmp = join(tmpDir, key);
	const hash = createHash('sha256');
	let bytes = 0;
	const meter = new Transform({
		transform(chunk, _enc, done) {
			bytes += chunk.length;
			if (bytes > maxBytes) return done(new TooLarge(`over ${maxBytes} bytes`));
			hash.update(chunk);
			done(null, chunk);
		},
	});
	try {
		await pipeline(
			Readable.fromWeb(body),
			meter,
			nodeFs.createWriteStream(tmp, { flags: 'wx', mode: 0o600 }),
		);
		const sub = join(dir, key.slice(0, 2));
		await nodeFs.promises.mkdir(sub, { recursive: true });
		const path = join(sub, key);
		await moveInto(tmp, path, fs);
		return { key, bytes, sha256: hash.digest('hex'), path };
	} catch (e) {
		await nodeFs.promises.rm(tmp, { force: true }); // abort, over limit, disk error: no leftovers
		throw e;
	}
}
