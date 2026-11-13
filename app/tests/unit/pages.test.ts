// FEATURES §6 PAGE tests (server side).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as keep from '../../src/lib/server/repo/keep';
import { search } from '../../src/lib/server/search';
import { undo, undoable } from '../../src/lib/server/undo';

let me: string;
let other: string;
beforeEach(() => {
	freshDb();
	const mk = (u: string) =>
		usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
	me = mk('jeremy');
	other = mk('neina');
});
const page = (title: string, parentId: string | null = null) =>
	pages.create(me, pages.createSchema.parse({ title, parentId }));
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const link = (pageId: string) => ({ type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId } }] });
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const treeIds = () => pages.tree(me).map((n) => n.id);

describe('Pages', () => {
	it('recent: last opened first, mine only, no archived, capped', () => {
		const [a, b, c] = [page('A'), page('B'), page('C')];
		const at = (id: string, t: string) => handle().sqlite.prepare(`UPDATE pages SET last_opened_at = ? WHERE id = ?`).run(t, id); // prettier-ignore
		at(a.id, '2026-11-10T00:00:00Z');
		at(b.id, '2026-11-12T00:00:00Z');
		at(c.id, '2026-11-11T00:00:00Z');
		pages.create(other, pages.createSchema.parse({ title: 'Not mine' }));
		pages.archive(me, c.id);
		expect(pages.recent(me).map((r) => r.title)).toEqual(['B', 'A']);
		expect(pages.recent(me, 1).map((r) => r.title)).toEqual(['B']);
	});

	it('PAGE-001/002: create root + child; empty title stays empty (UI shows Untitled)', () => {
		const a = page('');
		const b = page('Child', a.id);
		expect(a.title).toBe('');
		expect(b.parentId).toBe(a.id);
		expect(pages.get(me, b.id).crumbs).toEqual([{ id: a.id, title: '' }]);
	});

	it('PAGE-003: move under own descendant rejected; under another root ok', () => {
		const a = page('A');
		const b = page('B', a.id);
		const c = page('C', b.id);
		expect(() => pages.move(me, a.id, c.id)).toThrow(/inside itself/);
		expect(() => pages.move(me, a.id, a.id)).toThrow(/inside itself/);
		const z = page('Z');
		pages.move(me, b.id, z.id);
		expect(pages.get(me, b.id).parentId).toBe(z.id);
	});

	it('PAGE-004/016: rename or move a linked page, the link still resolves to the new title', () => {
		const target = page('Workouts');
		const src = page('Index');
		pages.update(me, src.id, { doc: doc(p('see'), link(target.id)) });
		pages.update(me, target.id, { title: 'Gym log' });
		pages.move(me, target.id, src.id);
		expect(pages.get(me, src.id).links[target.id]).toEqual({ title: 'Gym log', archived: false });
	});

	it('doc round-trips; unknown nodes, unsafe links, images without alt are refused', () => {
		const a = page('A');
		const d = doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }] }] }, p('x'));
		pages.update(me, a.id, { doc: d });
		expect(pages.get(me, a.id).doc).toEqual(d);
		expect(() => pages.update(me, a.id, { doc: doc({ type: 'iframe' }) })).toThrow(/unknown block type/);
		const js = { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] };
		expect(() => pages.update(me, a.id, { doc: doc(js) })).toThrow(/http/);
		expect(() => pages.update(me, a.id, { doc: doc({ type: 'image', attrs: { src: '/api/attachments/att_abc', alt: '' } }) })).toThrow(/alt text/);
	}); // prettier-ignore

	it('stale revision -> 409 and nothing changes', () => {
		const a = page('A');
		pages.update(me, a.id, { title: 'B' });
		expect(() => pages.update(me, a.id, { title: 'C', revision: a.revision })).toThrow(
			/changed somewhere else/,
		);
		expect(pages.get(me, a.id).title).toBe('B');
	});

	it('PAGE-007: reorder siblings persists', () => {
		const [a, b, c] = [page('A'), page('B'), page('C')];
		pages.move(me, c.id, null, a.id);
		expect(treeIds()).toEqual([c.id, a.id, b.id]);
	});

	it('PAGE-020: 4th pin blocked; archived pages unpinned', () => {
		const ids = [page('1'), page('2'), page('3'), page('4')].map((x) => x.id);
		expect(() => pages.setPins(me, ids)).toThrow(/pin 3/);
		pages.setPins(me, ids.slice(0, 3));
		pages.setPins(me, [ids[2] as string, ids[0] as string]); // reorder by full list
		expect(pages.pins(me).map((x) => x.id)).toEqual([ids[2], ids[0]]);
		const r = pages.archive(me, ids[2] as string);
		expect(r.unpinned).toBe(1);
		expect(pages.pins(me).map((x) => x.id)).toEqual([ids[0]]);
	});

	it('PAGE-021: archive -> gone from sidebar + default search, link still opens, flagged archived', () => {
		const a = page('Old recipes');
		const src = page('Index');
		pages.update(me, src.id, { doc: doc(link(a.id)) });
		pages.archive(me, a.id);
		expect(treeIds()).not.toContain(a.id);
		expect(search(me, 'recipes').map((h) => h.id)).toEqual([]);
		expect(search(me, 'recipes', { includeArchived: true }).map((h) => h.id)).toEqual([a.id]);
		expect(pages.get(me, src.id).links[a.id]).toEqual({ title: 'Old recipes', archived: true });
		expect(pages.get(me, a.id).archived).toBe(true);
	});

	it('PAGE-022: archive parent takes children; one undo restores all; restore returns to old parent', () => {
		const a = page('A');
		const b = page('B', a.id);
		undoable(me, 'Archive', pages.subtreeTargets(me, a.id), () => ({ result: pages.archive(me, a.id) }));
		expect(treeIds()).toEqual([]);
		undo(me);
		expect(treeIds().sort()).toEqual([a.id, b.id].sort());
		pages.archive(me, b.id);
		pages.restoreArchived(me, b.id);
		expect(pages.get(me, b.id).parentId).toBe(a.id);
		pages.archive(me, b.id);
		pages.archive(me, a.id); // parent archived on its own
		pages.restoreArchived(me, b.id); // old parent not live -> root
		expect(pages.get(me, b.id).parentId).toBeNull();
	});

	it('suggestions list stale pages but never archive anything', () => {
		const a = page('Ancient');
		expect(pages.suggestions(me, Date.now() + 91 * 86_400_000).map((s) => s.id)).toEqual([a.id]);
		expect(treeIds()).toEqual([a.id]);
	});

	it('trash (D-18): page + subpages, restore by batch, purge after 30 days', () => {
		const a = page('A');
		const b = page('B', a.id);
		const t = pages.trash(me, a.id);
		expect(t.count).toBe(2);
		expect(() => pages.get(me, b.id)).toThrow(/Not found/);
		pages.restoreTrashed(me, t.batch);
		expect(pages.get(me, b.id).parentId).toBe(a.id);
		pages.trash(me, a.id);
		pages.purgeTrash(Date.now() + 31 * 86_400_000);
		expect(pages.trashed(me)).toEqual([]);
	});

	it("PAGE-022b / KEEP-019: A can't find or open B's page or note (no title, no snippet)", () => {
		const a = page('Secret plans');
		pages.update(me, a.id, { doc: doc(p('launch codes')) });
		keep.create(me, { title: 'Secret note', body: 'launch codes' });
		expect(search(other, 'launch')).toEqual([]);
		expect(search(other, 'secret')).toEqual([]);
		expect(() => pages.get(other, a.id)).toThrow(/Not found/);
		expect(pages.findByTitle(other, 'Secret')).toEqual([]);
		// a link to someone else's page id resolves as unavailable, never with their title
		const mine = pages.create(other, pages.createSchema.parse({ title: 'Mine' }));
		pages.update(other, mine.id, { doc: doc(link(a.id)) });
		expect(pages.get(other, mine.id).links[a.id]).toBeNull();
	});

	it('search: pages + notes in one index, prefix words, FTS syntax is harmless', () => {
		const a = page('Restaurant plan');
		const n = keep.create(me, { body: 'restock rice' });
		expect(search(me, 'rest pla').map((h) => h.id)).toEqual([a.id]);
		expect(
			search(me, 'rest')
				.map((h) => h.id)
				.sort(),
		).toEqual([a.id, n.id].sort());
		expect(search(me, '"* OR NEAR(')).toEqual([]);
	});
});
