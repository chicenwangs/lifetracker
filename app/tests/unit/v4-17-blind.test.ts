// Blind tests for card 17 (duplicate page), written from its Done-when lines only. No builder test was opened.
// In-memory DB. The duplicate POST and the copy's DELETE go through their real route handlers; reads go through
// the owner-scoped repo; several invariants are checked straight from SQLite (page_blocks, page_links, databases).
import { beforeEach, describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as shares from '../../src/lib/server/repo/shares';
import * as databases from '../../src/lib/server/repo/databases';
import { POST as duplicatePost } from '../../src/routes/api/pages/[id]/duplicate/+server';
import { DELETE as pageDelete } from '../../src/routes/api/pages/[id]/+server';

let me: string;
let partner: string;
let viewer: string;
let editor: string;
let stranger: string;

beforeEach(() => {
	freshDb();
	const mk = (u: string) =>
		usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
	me = mk('jeremy');
	partner = mk('neina');
	viewer = mk('vee');
	editor = mk('eddie');
	stranger = mk('sam');
});

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const linkNode = (pageId: string) => ({ type: 'pageLink', attrs: { pageId } });
const linkPara = (pageId: string) => ({ type: 'paragraph', content: [linkNode(pageId)] });
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const page = (title: string, parentId: string | null = null, owner = me) =>
	pages.create(owner, pages.createSchema.parse({ title, parentId }));

const sql = <T>(q: string, ...a: unknown[]) =>
	handle()
		.sqlite.prepare(q)
		.all(...a) as T[];
const one = <T>(q: string, ...a: unknown[]) =>
	handle()
		.sqlite.prepare(q)
		.get(...a) as T;
const countOf = (table: string) => one<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).n;

interface Reply {
	page?: { id: string; title: string; parentId: string | null; revision: number; access: string };
	error?: { code: string; message: string };
	batch?: string;
	count?: number;
}
const user = (id: string) =>
	({ id, username: id, displayName: id, role: 'member' }) as unknown as App.SafeUser;
/** a RequestEvent with just what these handlers read: locals.user, params.id, request */
function event(userId: string, id: string, method: 'POST' | 'DELETE'): RequestEvent {
	return {
		locals: { user: user(userId) },
		params: { id },
		request: new Request(`http://localhost/api/pages/${id}`, { method }),
	} as unknown as RequestEvent;
}
async function duplicate(userId: string, id: string) {
	const res = await duplicatePost(event(userId, id, 'POST'));
	return { status: res.status, json: (await res.json()) as Reply };
}

// ---- C1 ----------------------------------------------------------------------------------------------------
describe('C1 the POST route makes "Copy of <title>" under the same parent, directly below the source', () => {
	it('C1 returns exactly one page, same parent, next in the tree; empty title -> Copy of Untitled', async () => {
		const a = page('Blind17 A');
		const b = page('Blind17 B');
		const c = page('Blind17 C');
		const b1 = page('Blind17 B1', b.id);

		const r = await duplicate(me, b.id);
		expect(r.status, JSON.stringify(r.json)).toBe(201);
		expect(Object.keys(r.json)).toEqual(['page']);
		const copy = r.json.page!;
		expect(copy).toMatchObject({ title: 'Copy of Blind17 B', parentId: null, access: 'owner' });
		expect(copy.id).not.toBe(b.id);
		expect(countOf('pages')).toBe(5); // a, b, c, b1 + exactly one copy

		const roots = () =>
			pages
				.tree(me)
				.filter((n) => n.parentId === null)
				.map((n) => n.id);
		expect(roots()).toEqual([a.id, b.id, copy.id, c.id]);

		// a child source stays under the same parent, directly below it
		const r2 = await duplicate(me, b1.id);
		expect(r2.status).toBe(201);
		expect(r2.json.page!.parentId).toBe(b.id);
		expect(
			pages
				.tree(me)
				.filter((n) => n.parentId === b.id)
				.map((n) => n.id),
		).toEqual([b1.id, r2.json.page!.id]);

		// the last sibling: the copy lands directly below it
		const r3 = await duplicate(me, c.id);
		expect(roots()).toEqual([a.id, b.id, copy.id, c.id, r3.json.page!.id]);

		const untitled = page('');
		const r4 = await duplicate(me, untitled.id);
		expect(r4.json.page!.title).toBe('Copy of Untitled');
	});

	it('C1 adds "Copy of " then cuts to 300 so the SQL CHECK and patchSchema hold; an emoji is never split', async () => {
		const long = page('x'.repeat(300));
		const r = await duplicate(me, long.id);
		expect(r.status, JSON.stringify(r.json)).toBe(201);
		const t = r.json.page!.title;
		expect(t).toBe('Copy of ' + 'x'.repeat(292));
		expect(t.length).toBe(300);
		expect(one<{ n: number }>('SELECT length(title) AS n FROM pages WHERE id = ?', r.json.page!.id).n).toBe(
			300,
		);
		expect(pages.patchSchema.safeParse({ title: t }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ title: t + 'x' }).success).toBe(false);

		// 9 + 146 × 2 = 301 UTF-16 units: the cut drops one whole emoji instead of splitting it
		const emoji = page('🧪'.repeat(146));
		const e = await duplicate(me, emoji.id);
		const et = e.json.page!.title;
		expect(et.startsWith('Copy of ')).toBe(true);
		expect(et.length).toBeLessThanOrEqual(300);
		expect(et.endsWith('🧪')).toBe(true);
		expect(() => encodeURIComponent(et)).not.toThrow(); // no lone surrogate
		expect(
			one<{ n: number }>('SELECT length(title) AS n FROM pages WHERE id = ?', e.json.page!.id).n,
		).toBeLessThanOrEqual(300);
	});
});

// ---- C2 ----------------------------------------------------------------------------------------------------
describe('C2 the copy holds the same top-level blocks with new page_blocks ids; the source is untouched', () => {
	it('C2 same node types/JSON in the same order, every block id new, source revision/updatedAt unchanged', async () => {
		const target = page('Blind17 link target');
		const src = page('Blind17 C2 source');
		const d = doc(
			para('first paragraph'),
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A heading' }] },
			{ type: 'bulletList', content: [{ type: 'listItem', content: [para('bullet one')] }] },
			{
				type: 'orderedList',
				attrs: { start: 1 },
				content: [{ type: 'listItem', content: [para('ordered one')] }],
			},
			{
				type: 'taskList',
				content: [{ type: 'taskItem', attrs: { checked: true }, content: [para('done thing')] }],
			},
			{
				type: 'table',
				content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('cell')] }] }],
			},
			{ type: 'image', attrs: { src: '/api/attachments/att_blind17', alt: 'a picture' } },
			{ type: 'paragraph', content: [{ type: 'text', text: 'see ' }, linkNode(target.id)] },
		);
		pages.update(me, src.id, { doc: d });
		const before = pages.get(me, src.id, false);
		const blocks = (id: string) =>
			sql<{ id: string; block_type: string; content_json: string }>(
				'SELECT id, block_type, content_json FROM page_blocks WHERE page_id = ? ORDER BY position',
				id,
			);
		const srcBlocks = blocks(src.id);
		expect(srcBlocks).toHaveLength(8);

		const copy = (await duplicate(me, src.id)).json.page!;
		const copyBlocks = blocks(copy.id);

		expect(copyBlocks.map((b) => b.block_type)).toEqual(srcBlocks.map((b) => b.block_type));
		expect(copyBlocks.map((b) => JSON.parse(b.content_json))).toEqual(
			srcBlocks.map((b) => JSON.parse(b.content_json)),
		);
		const srcIds = new Set(srcBlocks.map((b) => b.id));
		for (const b of copyBlocks) {
			expect(b.id).toMatch(/^pbl_/);
			expect(srcIds.has(b.id)).toBe(false);
		}
		expect(new Set(copyBlocks.map((b) => b.id)).size).toBe(copyBlocks.length);

		const after = pages.get(me, src.id, false);
		expect(after.revision).toBe(before.revision);
		expect(after.updatedAt).toBe(before.updatedAt);
		expect(after.doc).toEqual(d);
	});
});

// ---- C3 ----------------------------------------------------------------------------------------------------
describe('C3 page_links is rebuilt for the copy; a source self-link stays on the source', () => {
	it('C3 one row per unique (block, target), no row points at the copy, self-link names the source', async () => {
		const target = page('Blind17 C3 target');
		const src = page('Blind17 C3 source');
		pages.update(me, src.id, {
			doc: doc(
				{ type: 'paragraph', content: [{ type: 'text', text: 'go ' }, linkNode(target.id)] },
				{ type: 'paragraph', content: [linkNode(target.id), linkNode(target.id)] }, // 2 links, 1 block
				linkPara(src.id), // points at the source itself
			),
		});
		const rowsOf = (id: string) =>
			sql<{ target_page_id: string; source_block_id: string }>(
				'SELECT target_page_id, source_block_id FROM page_links WHERE source_page_id = ?',
				id,
			);
		const srcLinks = rowsOf(src.id);
		expect(srcLinks.map((l) => l.target_page_id)).toEqual([target.id, target.id]);

		const copy = (await duplicate(me, src.id)).json.page!;
		const rows = rowsOf(copy.id);
		const toTarget = rows.filter((r) => r.target_page_id === target.id);
		expect(toTarget).toHaveLength(2); // one per (block, target): the 2 links in one block collapse
		expect(new Set(toTarget.map((r) => r.source_block_id)).size).toBe(2);
		expect(rows.filter((r) => r.target_page_id === src.id)).toHaveLength(1);
		expect(rows.some((r) => r.target_page_id === copy.id)).toBe(false);

		// the copied node still names the source, and get() resolves both targets by their real titles
		const copied = pages.get(me, copy.id, false);
		const flat = JSON.stringify(copied.doc);
		expect(flat).toContain(`"pageId":"${src.id}"`);
		expect(flat).not.toContain(`"pageId":"${copy.id}"`);
		expect(copied.links[src.id]).toEqual({ title: 'Blind17 C3 source', archived: false });
		expect(copied.links[target.id]).toEqual({ title: 'Blind17 C3 target', archived: false });
		expect(rowsOf(src.id)).toEqual(srcLinks);
	});
});

// ---- C4 ----------------------------------------------------------------------------------------------------
describe('C4 a database block is copied as schema only, with view configs remapped', () => {
	it('C4 copy gets its own database: same props/views, zero records, doc points at the new id; source untouched', async () => {
		const src = page('Blind17 C4 source');
		const db = databases.create(me, { pageId: src.id, title: 'Blind17 DB' });
		const titleProp = databases.get(me, db.id).props[0]!;
		const score = databases.addProp(me, db.id, { name: 'Score', type: 'number', config: {} });
		const board = databases.addView(me, db.id, 'Board');
		databases.patchView(me, board.id, {
			config: {
				sort: { prop: score.id, dir: 'desc' },
				filters: [{ prop: score.id, op: 'gt', value: 2 }],
				hidden: [score.id],
				order: [titleProp.id, score.id],
			},
		});
		// a board view type no helper can make (view_type is copied as is)
		handle()
			.sqlite.prepare(
				`INSERT INTO database_views (id, database_id, name, view_type, config_json, position) VALUES ('pdv_blind17', ?, 'BoardTwo', 'board', ?, 2)`,
			)
			.run(db.id, JSON.stringify({ groupBy: score.id }));
		databases.addRecord(me, db.id, { [titleProp.id]: 'Row one', [score.id]: 5 });
		databases.addRecord(me, db.id, { [titleProp.id]: 'Row two', [score.id]: 1 });
		pages.update(me, src.id, {
			doc: doc(para('intro'), { type: 'database', attrs: { databaseId: db.id } }),
		});

		const sourceRows = databases.get(me, db.id);
		expect(sourceRows.total).toBe(2);
		const srcProps = sql<{ id: string; name: string; property_type: string; position: number }>(
			'SELECT id, name, property_type, position FROM database_properties WHERE database_id = ? ORDER BY position',
			db.id,
		);
		const srcViews = sql<{ name: string; view_type: string; position: number; config_json: string }>(
			'SELECT name, view_type, position, config_json FROM database_views WHERE database_id = ? ORDER BY position',
			db.id,
		);

		const copy = (await duplicate(me, src.id)).json.page!;
		const copyDoc = pages.get(me, copy.id, false).doc;
		const node = (copyDoc.content as { type: string; attrs?: { databaseId?: string } }[]).find(
			(n) => n.type === 'database',
		);
		expect(node?.attrs?.databaseId).toBeTruthy();
		const newDbId = node!.attrs!.databaseId!;
		expect(newDbId).not.toBe(db.id);

		const dbRow = one<{ owner_id: string; page_id: string }>(
			'SELECT owner_id, page_id FROM page_databases WHERE id = ?',
			newDbId,
		);
		expect(dbRow).toEqual({ owner_id: me, page_id: copy.id });

		const copyProps = sql<{ id: string; name: string; property_type: string; position: number }>(
			'SELECT id, name, property_type, position FROM database_properties WHERE database_id = ? ORDER BY position',
			newDbId,
		);
		expect(copyProps.map((p) => ({ name: p.name, type: p.property_type, pos: p.position }))).toEqual(
			srcProps.map((p) => ({ name: p.name, type: p.property_type, pos: p.position })),
		);
		const byName = new Map(copyProps.map((p) => [p.name, p.id]));

		const copyViews = sql<{ name: string; view_type: string; position: number; config_json: string }>(
			'SELECT name, view_type, position, config_json FROM database_views WHERE database_id = ? ORDER BY position',
			newDbId,
		);
		expect(copyViews.map((v) => ({ name: v.name, type: v.view_type, pos: v.position }))).toEqual(
			srcViews.map((v) => ({ name: v.name, type: v.view_type, pos: v.position })),
		);
		const cfg = (name: string) =>
			JSON.parse(copyViews.find((v) => v.name === name)!.config_json) as Record<string, unknown>;
		expect(cfg('Board')).toEqual({
			sort: { prop: byName.get('Score'), dir: 'desc' },
			filters: [{ prop: byName.get('Score'), op: 'gt', value: 2 }],
			hidden: [byName.get('Score')],
			order: [byName.get('Name'), byName.get('Score')],
		});
		expect(cfg('BoardTwo')).toEqual({ groupBy: byName.get('Score') });

		// no records, and the source database/values are identical before and after
		expect(databases.get(me, newDbId).rows).toEqual([]);
		expect(databases.get(me, newDbId).total).toBe(0);
		expect(
			one<{ n: number }>('SELECT count(*) AS n FROM database_records WHERE database_id = ?', newDbId).n,
		).toBe(0);
		expect(databases.get(me, db.id)).toEqual(sourceRows);
		expect(JSON.parse(srcViews.find((v) => v.name === 'Board')!.config_json).sort.prop).toBe(score.id); // untouched
	});
});

// ---- C5 ----------------------------------------------------------------------------------------------------
describe('C5 children, shares and pins are not copied; the copy behaves as a new page', () => {
	it('C5 no child pages, no page_shares row, no pin; last_opened_at is now', async () => {
		const src = page('Blind17 C5 source');
		const child = page('Blind17 C5 child', src.id);
		shares.put('page', me, src.id, { username: 'neina', permission: 'view' });
		pages.setPins(me, [src.id]);

		const copy = (await duplicate(me, src.id)).json.page!;
		expect(pages.tree(me).filter((n) => n.parentId === copy.id)).toEqual([]);
		expect(sql('SELECT id FROM page_shares WHERE page_id = ?', copy.id)).toEqual([]);
		expect(sql<{ id: string }>('SELECT id FROM page_shares WHERE page_id = ?', src.id)).toHaveLength(1);

		expect(one<{ n: number }>('SELECT count(*) AS n FROM page_shortcuts WHERE page_id = ?', copy.id).n).toBe(
			0,
		);
		expect(pages.pins(me).map((p) => p.id)).toEqual([src.id]);
		expect(pages.get(me, copy.id, false).pinned).toBe(false);

		const opened = one<{ last_opened_at: string | null }>(
			'SELECT last_opened_at FROM pages WHERE id = ?',
			copy.id,
		).last_opened_at;
		expect(opened).toBeTruthy();
		expect(Date.now() - Date.parse(opened!)).toBeLessThan(60_000);

		expect(pages.get(me, child.id, false).parentId).toBe(src.id); // the child stays with the source
	});
});

// ---- C6 ----------------------------------------------------------------------------------------------------
describe('C6 a shared page copies into MY account; a page I cannot see is 404', () => {
	it('C6 view and edit shares both duplicate to the signed-in user and my sidebar; a hidden page is 404', async () => {
		const viewSrc = page('Blind17 C6 view');
		shares.put('page', me, viewSrc.id, { username: 'vee', permission: 'view' });
		const viewCopy = (await duplicate(viewer, viewSrc.id)).json.page!;
		expect(viewCopy).toMatchObject({ title: 'Copy of Blind17 C6 view', access: 'owner' });
		expect(one<{ owner_id: string }>('SELECT owner_id FROM pages WHERE id = ?', viewCopy.id).owner_id).toBe(
			viewer,
		);
		expect(pages.tree(viewer).some((n) => n.id === viewCopy.id)).toBe(true);
		expect(pages.tree(me).some((n) => n.id === viewCopy.id)).toBe(false);
		expect(one<{ n: number }>('SELECT count(*) AS n FROM page_shares WHERE page_id = ?', viewCopy.id).n).toBe(
			0,
		);

		const editSrc = page('Blind17 C6 edit');
		shares.put('page', me, editSrc.id, { username: 'eddie', permission: 'edit' });
		const editCopy = (await duplicate(editor, editSrc.id)).json.page!;
		expect(one<{ owner_id: string }>('SELECT owner_id FROM pages WHERE id = ?', editCopy.id).owner_id).toBe(
			editor,
		);
		expect(pages.tree(editor).some((n) => n.id === editCopy.id)).toBe(true);

		const hidden = page('Blind17 C6 hidden');
		const before = countOf('pages');
		const r = await duplicate(stranger, hidden.id);
		expect(r.status).toBe(404);
		expect(r.json.error).toEqual({ code: 'not_found', message: 'Not found' });
		expect(countOf('pages')).toBe(before);
	});
});

// ---- C8 ----------------------------------------------------------------------------------------------------
describe('C8 no journal row; the toast path trashes the copy only', () => {
	it('C8 duplicating writes no undo_actions, DELETE trashes the copy (restorable), the source never changes', async () => {
		const src = page('Blind17 C8 source');
		pages.update(me, src.id, { doc: doc(para('keep me')) });
		const before = pages.get(me, src.id, false);
		expect(countOf('undo_actions')).toBe(0);

		const copy = (await duplicate(me, src.id)).json.page!;
		expect(countOf('undo_actions')).toBe(0); // Ctrl+Z has nothing of its own to replay

		const res = await pageDelete(event(me, copy.id, 'DELETE'));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Reply;
		expect(body.batch).toMatch(/^del_/);
		expect(body.count).toBe(1);
		expect(() => pages.get(me, copy.id, false)).toThrow(/Not found/);
		expect(pages.trashed(me).some((t) => t.title === 'Copy of Blind17 C8 source')).toBe(true);

		const after = pages.get(me, src.id, false);
		expect(after).toMatchObject({
			revision: before.revision,
			updatedAt: before.updatedAt,
			doc: before.doc,
			title: before.title,
		});
		expect(countOf('undo_actions')).toBe(0);
	});
});

// ---- C9 ----------------------------------------------------------------------------------------------------
describe('C9 two copies are independent; a failed duplicate leaves nothing behind', () => {
	it('C9 duplicating twice makes two pages with their own blocks; editing one leaves the other alone', async () => {
		const src = page('Blind17 C9 twice');
		pages.update(me, src.id, { doc: doc(para('original text')) });
		const a = (await duplicate(me, src.id)).json.page!;
		const b = (await duplicate(me, src.id)).json.page!;
		expect(a.id).not.toBe(b.id);
		expect(a.title).toBe('Copy of Blind17 C9 twice');

		const blocks = (id: string) =>
			sql<{ id: string }>('SELECT id FROM page_blocks WHERE page_id = ? ORDER BY position', id).map(
				(x) => x.id,
			);
		expect(blocks(a.id)).not.toEqual(blocks(b.id));

		pages.update(me, a.id, { doc: doc(para('only copy A changed')) });
		expect(pages.get(me, b.id, false).doc).toEqual(doc(para('original text')));
		expect(pages.get(me, src.id, false).doc).toEqual(doc(para('original text')));
	});

	it('C9 a failing duplicate rolls back the page, blocks and database rows', async () => {
		// a document naming a database I cannot see: copySchema throws inside the duplicate transaction
		const theirPage = page('Blind17 C9 theirs', null, partner);
		const theirDb = databases.create(partner, { pageId: theirPage.id, title: 'Their database' });
		const src = page('Blind17 C9 broken');
		pages.update(me, src.id, {
			doc: doc(para('intro'), { type: 'database', attrs: { databaseId: theirDb.id } }),
		});
		const before = pages.get(me, src.id, false);
		const tables = [
			'pages',
			'page_blocks',
			'page_links',
			'page_databases',
			'database_properties',
			'database_views',
			'database_records',
		];
		const counts = Object.fromEntries(tables.map((t) => [t, countOf(t)]));

		const r = await duplicate(me, src.id);
		expect(r.status).toBe(404);
		expect(r.json.error?.code).toBe('not_found');

		for (const t of tables) expect(countOf(t), t).toBe(counts[t]); // everything rolled back
		expect(sql('SELECT id FROM pages WHERE title = ?', 'Copy of Blind17 C9 broken')).toEqual([]);
		const after = pages.get(me, src.id, false);
		expect(after).toMatchObject({ revision: before.revision, updatedAt: before.updatedAt, doc: before.doc });
	});
});
