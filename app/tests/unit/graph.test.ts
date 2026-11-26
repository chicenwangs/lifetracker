// FEATURES PG-GRAPH: PAGE-017 (accessible nodes + edges), archived included + flagged, nothing of anyone else.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import { graph, localGraph } from '../../src/lib/server/graph';
import * as shares from '../../src/lib/server/repo/shares';

let me: string;
let other: string;
beforeEach(() => {
	freshDb();
	const mk = (u: string) =>
		usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
	me = mk('jeremy');
	other = mk('neina');
});
const link = (pageId: string) => ({ type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId } }] });

it('nodes = my live pages (archived flagged), edges = parent + links; other users see none of it', () => {
	const a = pages.create(me, { parentId: null, title: 'A' });
	const b = pages.create(me, { parentId: a.id, title: 'B' });
	const c = pages.create(me, { parentId: null, title: 'C' });
	const gone = pages.create(me, { parentId: null, title: 'Gone' });
	pages.update(me, c.id, { doc: { type: 'doc', content: [link(b.id), link(gone.id)] } });
	pages.archive(me, b.id);
	pages.trash(me, gone.id);
	const theirs = pages.create(other, { parentId: null, title: 'Theirs' });
	// their link to my page: never an edge in my graph, never a node in theirs
	pages.update(other, theirs.id, { doc: { type: 'doc', content: [link(a.id)] } });

	const g = graph(me);
	expect(g.nodes.map((n) => n.title).sort()).toEqual(['A', 'B', 'C']);
	expect(g.nodes.find((n) => n.title === 'B')?.archived).toBe(true);
	expect(g.edges).toEqual(
		expect.arrayContaining([
			{ source: a.id, target: b.id, relation: 'parent' },
			{ source: c.id, target: b.id, relation: 'link' },
		]),
	);
	expect(g.edges).toHaveLength(2);
	const t = graph(other);
	expect(t.nodes.map((n) => n.title)).toEqual(['Theirs']);
	expect(t.edges).toEqual([]);
});

it('local graph (PR 21): depth 1 vs 2, and only pages the viewer can open', () => {
	const a = pages.create(me, { parentId: null, title: 'A' });
	const b = pages.create(me, { parentId: null, title: 'B' });
	const c = pages.create(me, { parentId: null, title: 'C' });
	const d = pages.create(me, { parentId: null, title: 'D' });
	const doc = (...ids: string[]) => ({ type: 'doc' as const, content: ids.map((id) => link(id)) });
	pages.update(me, a.id, { doc: doc(b.id) });
	pages.update(me, b.id, { doc: doc(c.id) });
	pages.update(me, c.id, { doc: doc(d.id) });
	const g1 = localGraph(me, a.id, 1);
	expect(g1.nodes.map((n) => n.title).sort()).toEqual(['A', 'B']);
	expect(g1.edges).toEqual([{ source: a.id, target: b.id, relation: 'link' }]);
	const g2 = localGraph(me, a.id, 2);
	expect(g2.nodes.map((n) => n.title).sort()).toEqual(['A', 'B', 'C']);
	// the partner can open A and B only: C (and D) must never appear, not even as ids
	shares.put('page', me, a.id, { username: 'neina', permission: 'view' });
	shares.put('page', me, b.id, { username: 'neina', permission: 'view' });
	const gp = localGraph(other, a.id, 2);
	expect(gp.nodes.map((n) => n.title).sort()).toEqual(['A', 'B']);
	expect(JSON.stringify(gp)).not.toContain(c.id);
	expect(JSON.stringify(gp)).not.toContain(d.id);
	expect(() => localGraph(other, c.id, 2)).toThrow(); // not shared: 404, never a subgraph
});
