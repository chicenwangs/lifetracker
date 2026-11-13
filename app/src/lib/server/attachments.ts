// Attachment store (DESIGN §12, ADR-005, D-12). Files on disk under env().uploadDir, metadata in SQLite.
// Upload: stream to <dir>/.tmp (same filesystem, never /tmp) -> count bytes + sha256 -> sniff magic bytes ->
// rename into <dir>/<2-char>/<key> -> one short txn marks it ready. Nothing is ever held in memory.
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handle } from './db';
import { env } from './env';
import { ApiFail } from './http';
import { newId } from './crypto';
import { nowUtcIso } from '$lib/time';

export const ORPHAN_GRACE_MS = 7 * 86_400_000; // D-12
const STALE_MS = 3_600_000;

/** D-12 allowlist: ext -> served type + magic-byte check */
const KINDS: Record<string, { mime: string; magic: (b: Buffer) => boolean; inline?: true }> = {
	png: { mime: 'image/png', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), inline: true },
	jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, inline: true },
	jpeg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, inline: true },
	gif: { mime: 'image/gif', magic: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8', inline: true },
	webp: { mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP', inline: true },
	pdf: { mime: 'application/pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
	zip: { mime: 'application/zip', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
	docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
	xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
	pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
	doc: { mime: 'application/msword', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
	xls: { mime: 'application/vnd.ms-excel', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
	ppt: { mime: 'application/vnd.ms-powerpoint', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
	txt: { mime: 'text/plain; charset=utf-8', magic: (b) => !b.includes(0) },
	md: { mime: 'text/plain; charset=utf-8', magic: (b) => !b.includes(0) },
	csv: { mime: 'text/plain; charset=utf-8', magic: (b) => !b.includes(0) },
}; // prettier-ignore
export const ALLOWED_EXT = Object.keys(KINDS);

/** strip paths, control chars and odd quotes; keep it short. Never used as a path. */
export function cleanName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? '';
	const s = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').trim().slice(0, 200); // eslint-disable-line no-control-regex
	return s || 'file';
}
const extOf = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? '').toLowerCase();

export interface AttachmentDTO {
	id: string;
	name: string;
	mime: string;
	size: number;
	url: string;
}
type Row = { id: string; owner_id: string; storage_key: string; original_name: string; mime_type: string; byte_size: number; status: string; deleted_at: string | null }; // prettier-ignore
const db = () => handle().sqlite;
const toDTO = (r: Row): AttachmentDTO => ({ id: r.id, name: r.original_name, mime: r.mime_type, size: r.byte_size, url: `/api/attachments/${r.id}` }); // prettier-ignore
const pathOf = (key: string) => join(env().uploadDir, key.slice(0, 2), key);

/** rename, or copy + delete when tmp and target are on different filesystems (ADR-005) */
async function moveInto(from: string, to: string) {
	try {
		await fs.promises.rename(from, to);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
		await fs.promises.copyFile(from, to);
		await fs.promises.unlink(from);
	}
}

const tooBig = () => new ApiFail(413, 'too_large', `Files can be up to ${Math.round(env().MAX_UPLOAD_BYTES / 1048576)} MB.`);

/** stream a request body to disk. `declared` = Content-Length if the client sent one. */
export async function save(
	ownerId: string,
	body: ReadableStream<Uint8Array> | null,
	nameIn: string,
	declared: number | null,
): Promise<AttachmentDTO> {
	const name = cleanName(nameIn);
	const kind = KINDS[extOf(name)];
	if (!kind) throw new ApiFail(400, 'bad_type', `This file type isn't allowed. Allowed: ${ALLOWED_EXT.join(', ')}.`);
	const max = env().MAX_UPLOAD_BYTES;
	if (declared !== null && declared > max) throw tooBig();
	if (!body) throw new ApiFail(400, 'no_body', 'No file sent (missing Content-Type?).');

	const dir = env().uploadDir;
	await fs.promises.mkdir(join(dir, '.tmp'), { recursive: true });
	const key = randomBytes(16).toString('hex');
	const tmp = join(dir, '.tmp', key);
	const id = newId('att');
	db()
		.prepare(`INSERT INTO attachments (id, owner_id, storage_key, original_name, mime_type, byte_size, status, created_at) VALUES (?, ?, ?, ?, ?, 0, 'uploading', ?)`)
		.run(id, ownerId, key, name, kind.mime, nowUtcIso()); // prettier-ignore

	const hash = createHash('sha256');
	let bytes = 0;
	let head = Buffer.alloc(0);
	const meter = new Transform({
		transform(chunk: Buffer, _enc, done) {
			bytes += chunk.length;
			if (bytes > max) return done(tooBig());
			if (head.length < 4096) head = Buffer.concat([head, chunk.subarray(0, 4096 - head.length)]);
			hash.update(chunk);
			done(null, chunk);
		},
	});
	try {
		await pipeline(Readable.fromWeb(body as never), meter, fs.createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
		if (!bytes || !kind.magic(head)) throw new ApiFail(400, 'bad_content', "The file's content doesn't match its type.");
		await fs.promises.mkdir(join(dir, key.slice(0, 2)), { recursive: true });
		await moveInto(tmp, pathOf(key));
		db().prepare(`UPDATE attachments SET status = 'ready', byte_size = ?, sha256 = ? WHERE id = ?`).run(bytes, hash.digest('hex'), id);
		return toDTO(db().prepare(`SELECT * FROM attachments WHERE id = ?`).get(id) as Row);
	} catch (e) {
		await fs.promises.rm(tmp, { force: true }); // over limit, abort, bad content: no leftovers
		db().prepare(`UPDATE attachments SET status = 'failed' WHERE id = ?`).run(id);
		throw e;
	}
} // prettier-ignore

/** the file to send, if `userId` may read it. Owner only until sharing (P7) adds "can read a referencing source". */
export function readable(userId: string, id: string): { row: Row; path: string; inline: boolean } {
	const r = db().prepare(`SELECT * FROM attachments WHERE id = ?`).get(id) as Row | undefined;
	if (!r || r.owner_id !== userId || r.status !== 'ready' || r.deleted_at) throw new ApiFail(404, 'not_found', 'Not found');
	return { row: r, path: pathOf(r.storage_key), inline: !!KINDS[extOf(r.original_name)]?.inline };
}

/** link an attachment to its source (Keep note, page block …) */
export function addRef(ownerId: string, attachmentId: string, sourceType: string, sourceId: string): void {
	const r = db().prepare(`SELECT owner_id, status FROM attachments WHERE id = ?`).get(attachmentId) as { owner_id: string; status: string } | undefined;
	if (!r || r.owner_id !== ownerId || r.status !== 'ready') throw new ApiFail(404, 'not_found', 'Not found');
	db().prepare(`INSERT OR IGNORE INTO attachment_refs (id, attachment_id, owner_id, source_type, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
		.run(newId('atr'), attachmentId, ownerId, sourceType, sourceId, nowUtcIso());
} // prettier-ignore
export function dropRefs(sourceType: string, sourceId: string): void {
	db().prepare(`DELETE FROM attachment_refs WHERE source_type = ? AND source_id = ?`).run(sourceType, sourceId);
}

/** hourly: stale uploads + .tmp leftovers; unreferenced files past the grace (D-12) */
export function gc(now: number = Date.now()): void {
	const dir = env().uploadDir;
	const stale = nowUtcIso(now - STALE_MS);
	const orphan = nowUtcIso(now - ORPHAN_GRACE_MS);
	const dead = db()
		.prepare(
			`SELECT id, storage_key FROM attachments a
			 WHERE (status IN ('uploading','failed') AND created_at < ?)
			    OR (status = 'ready' AND created_at < ? AND NOT EXISTS (SELECT 1 FROM attachment_refs r WHERE r.attachment_id = a.id))`,
		)
		.all(stale, orphan) as { id: string; storage_key: string }[];
	for (const d of dead) {
		fs.rmSync(pathOf(d.storage_key), { force: true });
		db().prepare(`DELETE FROM attachments WHERE id = ?`).run(d.id);
	}
	try {
		for (const f of fs.readdirSync(join(dir, '.tmp'))) {
			const p = join(dir, '.tmp', f);
			if (now - fs.statSync(p).mtimeMs > STALE_MS) fs.rmSync(p, { force: true });
		}
	} catch {
		/* no .tmp yet */
	}
}
