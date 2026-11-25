// v4.0 PR 31: page cover — owner-only attachment, one ref keeps it from the orphan purge, remove clears it.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as attachments from '../../src/lib/server/attachments';
import { nowUtcIso } from '../../src/lib/time';

let u1: string;
let u2: string;
const sql = () => handle().sqlite;
const A1 = 'att_0000000000000001';
const A2 = 'att_0000000000000002';
const addAtt = (id: string, owner: string) =>
	sql()
		.prepare(
			`INSERT INTO attachments (id, owner_id, storage_key, original_name, mime_type, byte_size, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
		)
		.run(
			id,
			owner,
			id.slice(4).padEnd(32, 'a'),
			'cover.png',
			'image/png',
			12,
			'ready',
			nowUtcIso(Date.now() - 8 * 86_400_000),
		);
const refs = (pageId: string) =>
	(
		sql()
			.prepare(`SELECT count(*) AS n FROM attachment_refs WHERE source_type = 'page_cover' AND source_id = ?`)
			.get(pageId) as { n: number }
	).n;
const exists = (id: string) => !!sql().prepare('SELECT id FROM attachments WHERE id = ?').get(id);

beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	u1 = usersRepo.createWithCalendar({
		username: 'one',
		displayName: 'One',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	u2 = usersRepo.createWithCalendar({
		username: 'two',
		displayName: 'Two',
		passwordHash: 'x',
		role: 'member',
	}).id;
	addAtt(A1, u1);
	addAtt(A2, u2);
});

describe('page cover', () => {
	it('set, ref, remove', () => {
		const p = pages.create(u1, { parentId: null, title: 'Cover page' });
		const set = pages.update(u1, p.id, { coverAttachmentId: A1 });
		expect(set.coverAttachmentId).toBe(A1);
		expect(refs(p.id)).toBe(1);
		const off = pages.update(u1, p.id, { coverAttachmentId: null });
		expect(off.coverAttachmentId).toBe(null);
		expect(refs(p.id)).toBe(0);
	});
	it('refuses another user’s file', () => {
		const p = pages.create(u1, { parentId: null, title: 'Cover page' });
		expect(() => pages.update(u1, p.id, { coverAttachmentId: A2 })).toThrow();
		expect(pages.get(u1, p.id).coverAttachmentId).toBe(null);
	});
	it('the ref keeps the file from the orphan purge; removing the cover lets it go', () => {
		const p = pages.create(u1, { parentId: null, title: 'Cover page' });
		pages.update(u1, p.id, { coverAttachmentId: A1 });
		attachments.gc(Date.now()); // A1 is 8 days old but referenced: kept
		expect(exists(A1)).toBe(true);
		expect(exists(A2)).toBe(false); // u2's unreferenced file goes
		pages.update(u1, p.id, { coverAttachmentId: null });
		attachments.gc(Date.now());
		expect(exists(A1)).toBe(false);
	});
});
