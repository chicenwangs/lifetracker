// P7 security matrix (DESIGN §21): anon/other · owner · view · edit · revoked · guessed id · guessed file id,
// for pages, notes, databases and files. Denials are a plain 404 with no title/content in the message.
// Plus D-01 (no inheritance), D-02 (links need their own share), D-03 (whole DB), D-22 (dormant importer).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as keep from '../../src/lib/server/repo/keep';
import * as dbs from '../../src/lib/server/repo/databases';
import * as shares from '../../src/lib/server/repo/shares';
import * as attachments from '../../src/lib/server/attachments';
import { importDormant, pending } from '../../src/lib/server/dormant';
import { ApiFail } from '../../src/lib/server/http';

let owner: string, viewer: string, editor: string, stranger: string;
const mk = (u: string) =>
	usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
beforeEach(() => {
	freshDb();
	owner = mk('jeremy');
	viewer = mk('vee');
	editor = mk('eddie');
	stranger = mk('sam');
});
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
/** a denial: 404 with the generic message only (nothing about the thing itself) */
function denied(fn: () => unknown, status = 404) {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(ApiFail);
		expect((e as ApiFail).status).toBe(status);
		if (status === 404) expect((e as ApiFail).message).toBe('Not found');
		return;
	}
	throw new Error('expected a denial');
}
function fakeFile(ownerId: string): string {
	const id = `att_${'a'.repeat(15)}${ownerId.slice(-1)}`;
	handle().sqlite.prepare(`INSERT INTO attachments (id, owner_id, storage_key, original_name, mime_type, byte_size, status, created_at) VALUES (?, ?, ?, 'secret.png', 'image/png', 3, 'ready', '2026-11-14T00:00:00Z')`).run(id, ownerId, `k${id}`); // prettier-ignore
	return id;
}

describe('page shares', () => {
	it('matrix: owner, view, edit, other, revoked, guessed id', () => {
		const p = pages.create(owner, { parentId: null, title: 'Secret plans' });
		pages.update(owner, p.id, { doc: doc(para('the body')) });
		shares.put('page', owner, p.id, { username: 'vee', permission: 'view' });
		shares.put('page', owner, p.id, { username: 'EDDIE', permission: 'edit' }); // usernames: any case

		expect(shares.need('page', owner, p.id, 'owner')).toBe(owner);
		const seen = pages.get(shares.need('page', viewer, p.id), p.id, true, viewer);
		expect(seen.title).toBe('Secret plans');
		expect(seen.access).toBe('view');
		denied(() => shares.need('page', viewer, p.id, 'edit'), 403);

		const o = shares.need('page', editor, p.id, 'edit');
		pages.update(o, p.id, { title: 'Edited' }, editor);
		const by = handle().sqlite.prepare(`SELECT updated_by FROM pages WHERE id = ?`).get(p.id) as { updated_by: string }; // prettier-ignore
		expect(by.updated_by).toBe(editor);
		denied(() => shares.put('page', editor, p.id, { username: 'sam', permission: 'edit' }), 403); // can't re-share
		denied(() => pages.trash(editor, p.id)); // owner-scoped repo: can't delete, move or archive
		denied(() => pages.archive(editor, p.id));

		denied(() => shares.need('page', stranger, p.id));
		denied(() => shares.need('page', stranger, 'pg_0000000000000000'));
		expect(shares.sharedWithMe(stranger).pages).toEqual([]);

		const sid = shares.list('page', owner, p.id).find((s) => s.username === 'vee')?.id as string;
		shares.revoke('page', owner, p.id, sid);
		denied(() => shares.need('page', viewer, p.id)); // the very next request
		expect(shares.sharedWithMe(viewer).pages).toEqual([]);
		expect(shares.sharedWithMe(editor).pages.map((x) => x.title)).toEqual(['Edited']);
	});

	it('trashed page = gone for them too; sharing yourself / unknown user is refused', () => {
		const p = pages.create(owner, { parentId: null, title: 'P' });
		shares.put('page', owner, p.id, { username: 'vee', permission: 'view' });
		expect(() => shares.put('page', owner, p.id, { username: 'jeremy', permission: 'view' })).toThrow(/That's you/); // prettier-ignore
		expect(() => shares.put('page', owner, p.id, { username: 'nobody', permission: 'view' })).toThrow(/No one/); // prettier-ignore
		pages.trash(owner, p.id);
		denied(() => shares.need('page', viewer, p.id));
	});

	it('D-01 subpages stay private · D-02 links and crumbs only show what they can open', () => {
		const p = pages.create(owner, { parentId: null, title: 'Shared' });
		const child = pages.create(owner, { parentId: p.id, title: 'Child' });
		const other = pages.create(owner, { parentId: null, title: 'Private diary' });
		pages.update(owner, child.id, { doc: doc({ type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId: other.id } }, { type: 'pageLink', attrs: { pageId: p.id } }] }) }); // prettier-ignore
		shares.put('page', owner, child.id, { username: 'vee', permission: 'view' });
		denied(() => shares.need('page', viewer, p.id));
		const v = pages.get(owner, child.id, true, viewer);
		expect(v.crumbs).toEqual([]); // parent not shared: not even its title
		expect(v.links[other.id]).toBeNull();
		expect(v.links[p.id]).toBeNull();
		expect(JSON.stringify(v)).not.toContain('Private diary');
		expect(pages.get(owner, child.id).crumbs.map((c) => c.title)).toEqual(['Shared']); // owner unchanged
	});

	it('D-03 a shared page shares its database and record pages; view can read, edit can write', () => {
		const p = pages.create(owner, { parentId: null, title: 'Gym' });
		const d = dbs.create(owner, { pageId: p.id, title: 'Log' });
		const r = dbs.addRecord(owner, d.id);
		const rp = dbs.recordPage(owner, r.id);
		shares.put('page', owner, p.id, { username: 'vee', permission: 'view' });
		shares.put('page', owner, p.id, { username: 'eddie', permission: 'edit' });
		expect(shares.needDb(viewer, d.id)).toBe(owner);
		expect(shares.accessOf('page', viewer, rp)).toBe('view');
		denied(() => shares.needRecord(viewer, r.id, 'edit'), 403);
		expect(shares.needRecord(editor, r.id, 'edit')).toBe(owner);
		denied(() => shares.needDb(stranger, d.id));
		denied(() => shares.needRecord(stranger, r.id));
		denied(() => dbs.addProp(viewer, d.id, dbs.propCreateSchema.parse({ name: 'x', type: 'text' }))); // schema = owner only
	});
});

describe('note shares', () => {
	it('matrix: view, edit, other, revoked; archived still shared, trashed not', () => {
		const n = keep.create(owner, { title: 'Groceries', body: 'eggs' });
		shares.put('note', owner, n.id, { username: 'vee', permission: 'view' });
		shares.put('note', owner, n.id, { username: 'eddie', permission: 'edit' });
		expect(shares.need('note', viewer, n.id)).toBe(owner);
		denied(() => shares.need('note', viewer, n.id, 'edit'), 403);
		expect(shares.need('note', editor, n.id, 'edit')).toBe(owner);
		denied(() => shares.need('note', stranger, n.id));
		denied(() => shares.list('note', editor, n.id), 403);
		expect(shares.sharedWithMe(viewer).notes.map((x) => x.id)).toEqual([n.id]);
		keep.update(owner, n.id, { archived: true });
		expect(shares.need('note', viewer, n.id)).toBe(owner);
		keep.update(owner, n.id, { trashed: true });
		denied(() => shares.need('note', viewer, n.id));
		denied(() => shares.need('note', editor, n.id, 'edit'));
	});
});

describe('files follow their source', () => {
	it('page image: readable while the page is shared; not by others, not after revoke, not by guessing', () => {
		const att = fakeFile(owner);
		const p = pages.create(owner, { parentId: null, title: 'Pics' });
		pages.update(owner, p.id, {
			doc: doc({ type: 'image', attrs: { src: `/api/attachments/${att}`, alt: 'x' } }),
		});
		denied(() => attachments.readable(viewer, att));
		shares.put('page', owner, p.id, { username: 'vee', permission: 'view' });
		expect(attachments.readable(viewer, att).row.id).toBe(att);
		denied(() => attachments.readable(stranger, att));
		denied(() => attachments.readable(viewer, 'att_zzzzzzzzzzzzzzzz'));
		shares.revoke('page', owner, p.id, shares.list('page', owner, p.id)[0]?.id as string);
		denied(() => attachments.readable(viewer, att));
	});

	it("a pasted URL to someone else's file gives no access; the ref keeps it out of GC", () => {
		const theirs = fakeFile(stranger);
		const p = pages.create(owner, { parentId: null, title: 'P' });
		pages.update(owner, p.id, { doc: doc({ type: 'image', attrs: { src: `/api/attachments/${theirs}`, alt: 'x' } }) }); // prettier-ignore
		denied(() => attachments.readable(owner, theirs));
		const mine = fakeFile(owner);
		pages.update(owner, p.id, { doc: doc({ type: 'image', attrs: { src: `/api/attachments/${mine}`, alt: 'x' } }) }); // prettier-ignore
		const refs = handle().sqlite.prepare(`SELECT count(*) AS n FROM attachment_refs WHERE attachment_id = ?`).get(mine) as { n: number }; // prettier-ignore
		expect(refs.n).toBe(1);
	});

	it('note image: readable by the note grantee', () => {
		const att = fakeFile(owner);
		const n = keep.create(owner, { title: 'n', images: [att] });
		shares.put('note', owner, n.id, { username: 'vee', permission: 'view' });
		expect(attachments.readable(viewer, att).row.id).toBe(att);
		denied(() => attachments.readable(stranger, att));
	});
});

describe('D-22 dormant v1 data', () => {
	it('lists, people, ideas, workouts become Keep notes once; originals untouched', () => {
		const q = (sql: string, ...a: unknown[]) =>
			handle()
				.sqlite.prepare(sql)
				.run(...a);
		expect(pending(owner)).toEqual({ lists: 0, people: 0, ideas: 0, places: 0, goals: 0, workouts: 0 });
		q(`INSERT INTO lists (id, owner_id, name) VALUES ('l1', ?, 'Packing')`, owner);
		q(`INSERT INTO list_items (id, list_id, text, done, created_at) VALUES ('li1', 'l1', 'Passport', 1, 'x'), ('li2', 'l1', 'Socks', 0, 'x')`); // prettier-ignore
		q(`INSERT INTO people (id, owner_id, name, aliases) VALUES ('pp1', ?, 'Neina', '["N"]')`, owner);
		q(`INSERT INTO person_facts (id, person_id, category, text) VALUES ('pf1', 'pp1', 'likes', 'matcha')`);
		q(`INSERT INTO ideas (id, owner_id, channel, stage, text, created_at) VALUES ('i1', ?, 'yt', 'posted', 'vlog', 'x')`, owner); // prettier-ignore
		q(`INSERT INTO workout_split (id, owner_id, weekday, exercise, sort, current_kg) VALUES ('w1', ?, 1, 'Bench', 0, 60)`, owner); // prettier-ignore
		expect(pending(owner)?.lists).toBe(1);
		expect(importDormant(owner).notes).toBe(4);
		const notes = keep.list(owner);
		const packing = notes.find((n) => n.title === 'Packing');
		expect(packing?.items.map((i) => [i.text, i.checked])).toEqual([
			['Passport', true],
			['Socks', false],
		]);
		expect(notes.find((n) => n.title === 'Neina')?.body).toBe('Also: N\nlikes: matcha');
		expect(notes.find((n) => n.title === 'Workout split')?.body).toBe('Mon: Bench 60 kg');
		expect(keep.labels(owner).map((l) => l.name)).toEqual(['From v1']);
		expect(pending(owner)).toBeNull();
		expect(() => importDormant(owner)).toThrow(/already/);
		expect(handle().sqlite.prepare(`SELECT count(*) AS n FROM list_items`).get()).toEqual({ n: 2 });
		expect(pending(viewer)).not.toBeNull(); // per user
	});
});
