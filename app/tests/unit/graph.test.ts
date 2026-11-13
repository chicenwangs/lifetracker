// FEATURES PG-GRAPH: PAGE-017 (accessible nodes + edges), archived included + flagged, nothing of anyone else.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import { graph } from '../../src/lib/server/graph';

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
