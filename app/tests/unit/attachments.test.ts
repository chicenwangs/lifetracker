// DESIGN §12 / ADR-005 / D-12.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import { addRef, cleanName, gc, readable, save } from '../../src/lib/server/attachments';

let me: string;
let other: string;
let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'lt-up-'));
	freshDb({ UPLOAD_DIR: dir, MAX_UPLOAD_BYTES: '4096' });
	me = usersRepo.createWithCalendar({ username: 'jeremy', displayName: 'J', passwordHash: 'x', role: 'admin' }).id;
	other = usersRepo.createWithCalendar({ username: 'neina', displayName: 'N', passwordHash: 'x', role: 'member' }).id;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const body = (b: Buffer) => new Blob([new Uint8Array(b)]).stream();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const tmpLeft = () => (existsSync(join(dir, '.tmp')) ? readdirSync(join(dir, '.tmp')).length : 0);

describe('attachments', () => {
	it('stores a png under <2-char>/<key>, only the owner can read it', async () => {
		const a = await save(me, body(PNG), 'photo.png', PNG.length);
		expect(a).toMatchObject({ name: 'photo.png', mime: 'image/png', size: PNG.length });
		const r = readable(me, a.id);
		expect(readFileSync(r.path).equals(PNG)).toBe(true);
		expect(r.inline).toBe(true);
		expect(() => readable(other, a.id)).toThrow(/Not found/);
		expect(tmpLeft()).toBe(0);
	});

	it('refuses wrong type, fake content, over the limit; leaves nothing behind', async () => {
		await expect(save(me, body(PNG), 'x.exe', 10)).rejects.toThrow(/isn't allowed/);
		await expect(save(me, body(Buffer.from('hello')), 'fake.png', 5)).rejects.toThrow(/doesn't match/);
		await expect(save(me, body(Buffer.alloc(5000, 65)), 'big.txt', 5000)).rejects.toThrow(/up to/); // declared
		await expect(save(me, body(Buffer.alloc(5000, 65)), 'big.txt', null)).rejects.toThrow(/up to/); // counted
		expect(tmpLeft()).toBe(0);
	});

	it('cleans names: no paths, no control chars', () => {
		expect(cleanName('..\\..\\etc/passwd')).toBe('passwd');
		expect(cleanName('a\u0000b"c.txt')).toBe('abc.txt');
		expect(cleanName('')).toBe('file');
	});

	it('GC: unreferenced files go after 7 days, referenced ones stay', async () => {
		const keep = await save(me, body(Buffer.from('a')), 'a.txt', 1);
		const drop = await save(me, body(Buffer.from('b')), 'b.txt', 1);
		addRef(me, keep.id, 'keep_note', 'kn_x');
		const path = readable(me, drop.id).path;
		gc(Date.now() + 8 * 86_400_000);
		expect(readable(me, keep.id)).toBeTruthy();
		expect(() => readable(me, drop.id)).toThrow(/Not found/);
		expect(existsSync(path)).toBe(false);
	});
});
