// Card 17 (duplicate page, O-3, D-V4-23): title/parent/position, blocks with new ids, page_links rebuilt,
// a database copied as schema only with view configs remapped, no children/shares/pins, a shared page copied
// to the viewer, no journal row, and a failed run that leaves nothing behind.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as dbs from '../../src/lib/server/repo/databases';
import * as shares from '../../src/lib/server/repo/shares';
import { duplicate } from '../../src/lib/server/repo/duplicate';
import { undo } from '../../src/lib/server/undo';

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
const link = (pageId: string) => ({ type: 'pageLink', attrs: { pageId } });
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const sql = <T>(q: string, ...a: unknown[]) =>
	handle()
		.sqlite.prepare(q)
		.all(...a) as T[];
const count = (q: string, ...a: unknown[]) =>
	(
		handle()
			.sqlite.prepare(q)
			.get(...a) as { n: number }
	).n;

describe('v4 card 17 · duplicate page', () => {
	it('C1 title "Copy of <title>" (Untitled when empty, cut at 300), same parent, directly below the source', () => {
		const [a, b, c] = [page('A'), page('B'), page('C')];
		const copy = duplicate(me, b.id);
		expect(copy.title).toBe('Copy of B');
		expect(copy.parentId).toBeNull();
		expect(pages.tree(me).map((n) => n.id)).toEqual([a.id, b.id, copy.id, c.id]);
		// a child page copies under the same parent, right after its source
		const kid = page('Kid', a.id);
		const kidCopy = duplicate(me, kid.id);
		expect(kidCopy.parentId).toBe(a.id);
		expect(
			pages
				.tree(me)
				.filter((n) => n.parentId === a.id)
				.map((n) => n.id),
		).toEqual([kid.id, kidCopy.id]);
		// untitled source + the title limit (schema CHECK + patchSchema max 300)
		expect(duplicate(me, page('').id).title).toBe('Copy of Untitled');
		const long = page('x'.repeat(300));
		const longCopy = duplicate(me, long.id);
		expect(longCopy.title).toHaveLength(300);
		expect(longCopy.title.startsWith('Copy of x')).toBe(true);
		// an emoji title is cut without splitting a character and still fits both limits
		const emojiCopy = duplicate(me, page('🧪'.repeat(150)).id);
		expect(emojiCopy.title.length).toBeLessThanOrEqual(300);
		expect([...emojiCopy.title].length).toBeLessThanOrEqual(300);
		expect(emojiCopy.title.endsWith('🧪')).toBe(true);
	});

	it('C2 same top-level nodes and JSON in the same order, every block id new; the source row is untouched', () => {
		const src = page('Blocks');
		pages.update(me, src.id, {
			doc: doc(
				p('one'),
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Two' }] },
				{
					type: 'taskList',
					content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('three')] }],
				},
			),
		});
		const before = pages.get(me, src.id);
		const copy = duplicate(me, src.id);
		const after = pages.get(me, src.id);
		expect(after.revision).toBe(before.revision);
		expect(after.updatedAt).toBe(before.updatedAt);
		expect(after.doc).toEqual(before.doc);
		type Block = { id: string; block_type: string; content_json: string; position: number };
		const blocks = (id: string) =>
			sql<Block>(`SELECT id, block_type, content_json, position FROM page_blocks WHERE page_id = ? ORDER BY position`, id); // prettier-ignore
		const [sb, cb] = [blocks(src.id), blocks(copy.id)];
		expect(cb.map((x) => [x.block_type, x.content_json, x.position])).toEqual(
			sb.map((x) => [x.block_type, x.content_json, x.position]),
		);
		expect(cb.map((x) => x.id)).not.toEqual(sb.map((x) => x.id));
		expect(new Set(cb.map((x) => x.id)).size).toBe(cb.length);
		expect(pages.get(me, copy.id).doc).toEqual(before.doc);
	});

	it('C3 page_links rebuilt for the copy, one per unique (block, target); a self-link stays on the source', () => {
		const target = page('Target');
		const src = page('Links');
		pages.update(me, src.id, {
			doc: doc(
				{ type: 'paragraph', content: [link(target.id), link(target.id)] },
				{ type: 'paragraph', content: [link(src.id)] },
				{ type: 'paragraph', content: [link(target.id)] },
			),
		});
		const copy = duplicate(me, src.id);
		const rows = sql<{ target_page_id: string; source_block_id: string }>(
			`SELECT target_page_id, source_block_id FROM page_links WHERE source_page_id = ? ORDER BY source_block_id`, // prettier-ignore
			copy.id,
		);
		// block 1 -> target once (two links in one block), block 2 -> the source, block 3 -> target again
		expect(rows).toHaveLength(3);
		expect(rows.filter((r) => r.target_page_id === target.id)).toHaveLength(2);
		expect(rows.filter((r) => r.target_page_id === src.id)).toHaveLength(1);
		expect(new Set(rows.map((r) => `${r.source_block_id}:${r.target_page_id}`)).size).toBe(3);
		// never rewritten to the copy: the source's own id survives in the doc and resolves as the source
		expect(JSON.stringify(pages.get(me, copy.id).doc)).toContain(`"pageId":"${src.id}"`);
		expect(JSON.stringify(pages.get(me, copy.id).doc)).not.toContain(`"pageId":"${copy.id}"`);
		expect(pages.get(me, copy.id).links[src.id]).toEqual({ title: 'Links', archived: false });
	});

	it('C4 database block: schema only (props + views, zero records), node points at the copy, configs remapped', () => {
		const src = page('With a database');
		const created = dbs.create(me, { pageId: src.id, title: 'Reading' });
		const titleProp = dbs.get(me, created.id).props[0]?.id as string;
		const rating = dbs.addProp(me, created.id, dbs.propCreateSchema.parse({ name: 'Rating', type: 'number', config: {} })); // prettier-ignore
		dbs.addRecord(me, created.id, { [titleProp]: 'Dune', [rating.id]: 5 });
		dbs.patchView(me, dbs.get(me, created.id).viewId, {
			config: {
				sort: { prop: rating.id, dir: 'desc' },
				filters: [{ prop: rating.id, op: 'gt', value: 3 }],
				hidden: [rating.id],
				order: [titleProp, rating.id],
			},
		});
		pages.update(me, src.id, {
			doc: doc(p('list'), { type: 'database', attrs: { databaseId: created.id } }),
		});
		const before = dbs.get(me, created.id);
		const copy = duplicate(me, src.id);
		const node = pages.get(me, copy.id).doc.content[1] as { attrs: { databaseId: string } };
		expect(node.attrs.databaseId).not.toBe(created.id);
		const copied = dbs.get(me, node.attrs.databaseId);
		expect(copied.pageId).toBe(copy.id);
		expect(copied.title).toBe('Reading');
		expect(copied.props.map((x) => [x.name, x.type])).toEqual(before.props.map((x) => [x.name, x.type]));
		expect(copied.props.map((x) => x.id)).not.toEqual(before.props.map((x) => x.id));
		expect(copied.views.map((v) => [v.name, v.type])).toEqual(before.views.map((v) => [v.name, v.type]));
		expect(copied.rows).toEqual([]);
		expect(copied.total).toBe(0);
		// D-V4-23: every old property id in the view config is the copy's
		const newRating = copied.props.find((x) => x.name === 'Rating')?.id as string;
		const newTitle = copied.props.find((x) => x.type === 'title')?.id as string;
		expect(copied.views[0]?.config).toEqual({
			sort: { prop: newRating, dir: 'desc' },
			filters: [{ prop: newRating, op: 'gt', value: 3 }],
			hidden: [newRating],
			order: [newTitle, newRating],
		});
		// the source database and its record are untouched
		expect(dbs.get(me, created.id)).toEqual(before);
		expect(count(`SELECT count(*) AS n FROM database_records WHERE database_id = ?`, created.id)).toBe(1);
	});

	it('C5 no child pages, shares or pins; the copy looks opened now', () => {
		const src = page('Parent');
		page('Child', src.id);
		pages.setPins(me, [src.id]);
		const copy = duplicate(me, src.id);
		expect(pages.tree(me).filter((n) => n.parentId === copy.id)).toEqual([]);
		expect(pages.pins(me).map((x) => x.id)).toEqual([src.id]);
		expect(count(`SELECT count(*) AS n FROM page_shares WHERE page_id = ?`, copy.id)).toBe(0);
		const row = sql<{ last_opened_at: string | null }>(
			`SELECT last_opened_at FROM pages WHERE id = ?`,
			copy.id,
		)[0];
		expect(row?.last_opened_at).toBeTruthy();
	});

	it('C6 a shared page is copied into my account at my root (no shares), and an unseen id is 404', () => {
		const src = page('Shared plans');
		pages.update(me, src.id, { doc: doc(p('secret words'), link(src.id)) });
		shares.put('page', me, src.id, shares.shareSchema.parse({ username: 'neina', permission: 'view' }));
		const copy = duplicate(other, src.id);
		expect(copy.title).toBe('Copy of Shared plans');
		const row = sql<{ owner_id: string; parent_page_id: string | null }>(
			`SELECT owner_id, parent_page_id FROM pages WHERE id = ?`, // prettier-ignore
			copy.id,
		)[0];
		expect(row).toEqual({ owner_id: other, parent_page_id: null });
		expect(pages.tree(other).map((n) => n.id)).toEqual([copy.id]);
		expect(count(`SELECT count(*) AS n FROM page_shares WHERE page_id = ?`, copy.id)).toBe(0);
		expect(pages.get(other, copy.id).doc).toEqual(pages.get(me, src.id).doc);
		// an id the viewer cannot see never copies (and its existence is not revealed)
		const secret = page('Secret');
		expect(() => duplicate(other, secret.id)).toThrow(/Not found/);
		expect(() => duplicate(other, 'pg_aaaaaaaaaaaaaaaa')).toThrow(/Not found/);
	});

	it('C8 no journal row: Undo (the toast) is the only reversal and Ctrl+Z has nothing from a duplicate', () => {
		const src = page('Journal free');
		const before = count(`SELECT count(*) AS n FROM undo_actions WHERE user_id = ?`, me);
		duplicate(me, src.id);
		expect(count(`SELECT count(*) AS n FROM undo_actions WHERE user_id = ?`, me)).toBe(before);
		expect(() => undo(me)).toThrow(/Nothing to undo/);
	});

	it('C9 two duplicates are independent; a failed duplicate rolls back every row it made', () => {
		const src = page('Twice');
		pages.update(me, src.id, { doc: doc(p('first text')) });
		const one = duplicate(me, src.id);
		pages.update(me, one.id, { doc: doc(p('edited copy')) });
		const two = duplicate(me, src.id);
		expect(two.id).not.toBe(one.id);
		expect(two.title).toBe('Copy of Twice');
		expect(JSON.stringify(pages.get(me, two.id).doc)).toContain('first text');
		expect(JSON.stringify(pages.get(me, two.id).doc)).not.toContain('edited copy');
		expect(JSON.stringify(pages.get(me, one.id).doc)).toContain('edited copy');
		// a database the viewer cannot reach: the whole copy fails, nothing is left behind
		const shared = page('Shared with a foreign database');
		const privatePage = page('Private holder');
		const foreign = dbs.create(me, { pageId: privatePage.id, title: 'Foreign' });
		pages.update(me, shared.id, { doc: doc(p('x'), { type: 'database', attrs: { databaseId: foreign.id } }) }); // prettier-ignore
		shares.put('page', me, shared.id, shares.shareSchema.parse({ username: 'neina', permission: 'view' }));
		const before = {
			pages: count(`SELECT count(*) AS n FROM pages WHERE owner_id = ?`, other),
			dbs: count(`SELECT count(*) AS n FROM page_databases WHERE owner_id = ?`, other),
		};
		expect(() => duplicate(other, shared.id)).toThrow(/Not found/);
		expect(count(`SELECT count(*) AS n FROM pages WHERE owner_id = ?`, other)).toBe(before.pages);
		expect(count(`SELECT count(*) AS n FROM page_databases WHERE owner_id = ?`, other)).toBe(before.dbs);
		expect(
			count(`SELECT count(*) AS n FROM database_properties p JOIN page_databases d ON d.id = p.database_id WHERE d.owner_id = ?`, other), // prettier-ignore
		).toBe(0);
		expect(
			count(`SELECT count(*) AS n FROM database_views v JOIN page_databases d ON d.id = v.database_id WHERE d.owner_id = ?`, other), // prettier-ignore
		).toBe(0);
	});
});
