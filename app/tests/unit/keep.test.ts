// FEATURES §5 tests KEEP-001..016 (server side; UI in e2e).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as keep from '../../src/lib/server/repo/keep';
import { readable, save } from '../../src/lib/server/attachments';

let me: string;
let other: string;
let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'lt-keep-'));
	freshDb({ UPLOAD_DIR: dir });
	const mk = (u: string) =>
		usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
	me = mk('jeremy');
	other = mk('neina');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const note = (p: keep.NoteInput = {}) => keep.create(me, { body: 'b', ...p });
const ids = (l: keep.NoteDTO[]) => l.map((n) => n.id);

describe('Keep', () => {
	it('KEEP-001/002/003: title+body, body only, edit persists; empty refused', () => {
		const a = note({ title: 'Ideas', body: 'one' });
		expect(keep.get(me, a.id)).toMatchObject({ title: 'Ideas', body: 'one' });
		expect(note({ body: 'only body' }).title).toBe('');
		keep.update(me, a.id, { body: 'two' });
		expect(keep.get(me, a.id).body).toBe('two');
		expect(() => keep.create(me, { title: ' ', body: '' })).toThrow(/Empty/);
	});

	it('stale revision -> 409, text not overwritten', () => {
		const a = note();
		keep.update(me, a.id, { body: 'newer' });
		expect(() => keep.update(me, a.id, { body: 'old tab', revision: a.revision })).toThrow(
			/changed somewhere else/,
		);
		expect(keep.get(me, a.id).body).toBe('newer');
	});

	it('KEEP-005/006: checklist checks one item only, nested child persists, depth capped at 4', () => {
		const n = keep.create(me, {
			type: 'checklist',
			items: [
				{ id: 't1', text: 'trip', checked: false, parentId: null },
				{ id: 't2', text: 'pack', checked: true, parentId: 't1' },
				{ id: 't3', text: 'socks', checked: false, parentId: 't2' },
			],
		});
		expect(n.items.map((i) => i.checked)).toEqual([false, true, false]);
		expect(n.items[2]?.parentId).toBe(n.items[1]?.id);
		const deep = [1, 2, 3, 4, 5].map((i) => ({
			id: `d${i}`,
			text: `${i}`,
			checked: false,
			parentId: i > 1 ? `d${i - 1}` : null,
		}));
		expect(() => keep.create(me, { type: 'checklist', items: deep })).toThrow(/4 levels/);
	});

	it('KEEP-007/008/009: 2 labels + 2 binders in both filters; deleting a binder or label keeps notes', () => {
		const [l1, l2] = [keep.createLabel(me, 'home'), keep.createLabel(me, 'urgent')];
		const [b1, b2] = [keep.createBinder(me, 'Trip'), keep.createBinder(me, 'House')];
		const n = note({ labels: [l1.id, l2.id], binders: [b1.id, b2.id] });
		note();
		expect(ids(keep.list(me, { labels: [l1.id, l2.id] }))).toEqual([n.id]);
		expect(ids(keep.list(me, { binder: b1.id }))).toEqual([n.id]);
		expect(ids(keep.list(me, { binder: b2.id }))).toEqual([n.id]);
		keep.deleteBinder(me, b1.id);
		keep.deleteLabel(me, l1.id);
		expect(keep.get(me, n.id)).toMatchObject({ binders: [b2.id], labels: [l2.id] });
		expect(() => keep.createLabel(me, 'URGENT')).toThrow(/already have/);
	});

	it('KEEP-010/011/012: pin then archive -> not pinned; archive/restore; trash/restore', () => {
		const n = note({ pinned: true });
		keep.update(me, n.id, { archived: true });
		expect(keep.get(me, n.id).pinned).toBe(false);
		expect(ids(keep.list(me))).not.toContain(n.id);
		expect(ids(keep.list(me, { scope: 'archive' }))).toEqual([n.id]);
		keep.update(me, n.id, { archived: false });
		keep.update(me, n.id, { trashed: true });
		expect(ids(keep.list(me, { scope: 'trash' }))).toEqual([n.id]);
		keep.update(me, n.id, { trashed: false });
		expect(ids(keep.list(me))).toEqual([n.id]);
	});

	it('KEEP-013: permanent delete only from Trash; 30-day purge', () => {
		const n = note();
		expect(() => keep.destroy(me, n.id)).toThrow(/Trash first/);
		keep.update(me, n.id, { trashed: true });
		keep.destroy(me, n.id);
		expect(() => keep.get(me, n.id)).toThrow(/Not found/);
		const old = note();
		keep.update(me, old.id, { trashed: true });
		keep.purgeTrash(Date.now() + 31 * 86_400_000);
		expect(() => keep.get(me, old.id)).toThrow(/Not found/);
	});

	it('KEEP-014: search finds checklist text, % is literal', () => {
		const n = keep.create(me, {
			type: 'checklist',
			items: [{ text: 'buy rambutan', checked: false, parentId: null }],
		});
		note({ body: '100% done' });
		expect(ids(keep.list(me, { q: 'RAMBUTAN' }))).toEqual([n.id]);
		expect(keep.list(me, { q: '%' })).toHaveLength(1);
	});

	it('KEEP-016: image uploads, attaches, reopens; file outlives the note while referenced elsewhere', async () => {
		const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(20)]);
		const a = await save(me, new Blob([new Uint8Array(png)]).stream(), 'pic.png', png.length);
		const n = note({ images: [a.id] });
		expect(keep.get(me, n.id).images.map((i) => i.id)).toEqual([a.id]);
		const copy = keep.duplicate(me, n.id);
		keep.update(me, n.id, { trashed: true });
		keep.destroy(me, n.id);
		expect(keep.get(me, copy.id).images).toHaveLength(1);
		expect(readable(me, a.id)).toBeTruthy();
		await expect(save(me, new Blob(['x']).stream(), 'evil.exe', 1)).rejects.toThrow(/isn't allowed/); // KEEP-015
	});

	it('KEEP-019: someone else gets 404, never content', () => {
		const n = note({ title: 'secret' });
		expect(() => keep.get(other, n.id)).toThrow(/Not found/);
		expect(() => keep.update(other, n.id, { body: 'x' })).toThrow(/Not found/);
		expect(keep.list(other)).toEqual([]);
		const l = keep.createLabel(me, 'mine');
		expect(() => keep.create(other, { body: 'x', labels: [l.id] })).toThrow(/unknown label/);
	});

	it('reorder: above another note, and inside a binder', () => {
		const [a, b, c] = [note(), note(), note()]; // list order: c b a
		keep.move(me, a.id, c.id);
		expect(ids(keep.list(me))).toEqual([a.id, c.id, b.id]);
		const bd = keep.createBinder(me, 'X');
		keep.update(me, a.id, { binders: [bd.id] });
		keep.update(me, b.id, { binders: [bd.id] });
		keep.move(me, a.id, null, bd.id);
		expect(ids(keep.list(me, { binder: bd.id }))).toEqual([b.id, a.id]);
	});
});
