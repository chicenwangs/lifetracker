// v4.0 PR 17: duplicate a page — new block ids, links rebuilt, database schema only, no child pages, no shares.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as databases from '../../src/lib/server/repo/databases';
import * as shares from '../../src/lib/server/repo/shares';
import { duplicatePage } from '../../src/lib/server/repo/page-duplicate';
import { POST as duplicatePost } from '../../src/routes/api/pages/[id]/duplicate/+server';
import { POST as undoPost } from '../../src/routes/api/undo/+server';
import * as search from '../../src/lib/server/search';
import { nowUtcIso } from '../../src/lib/time';

let u1: string;
let u2: string;
const sql = () => handle().sqlite;

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
});

function source() {
	const parent = pages.create(u1, { parentId: null, title: 'Parent' });
	const p = pages.create(u1, { parentId: parent.id, title: 'Source page' });
	const target = pages.create(u1, { parentId: null, title: 'Linked target' });
	const child = pages.create(u1, { parentId: p.id, title: 'Child page' });
	const db = databases.create(u1, { pageId: p.id, title: 'Source db' });
	const sel = databases.addProp(u1, db.id, {
		name: 'Status',
		type: 'select',
		config: { options: [{ id: 'o1', label: 'A', color: 'blue' }] },
	});
	const when = databases.addProp(u1, db.id, { name: 'When', type: 'date', config: {} });
	const view = databases.addView(u1, db.id, 'Sorted');
	databases.patchView(u1, view.id, {
		config: { sort: { prop: sel.id, dir: 'asc' }, groupBy: sel.id, cardProps: [sel.id], dateProp: when.id },
	});
	databases.addRecord(u1, db.id);
	pages.update(u1, p.id, {
		doc: {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Hello copy' }] },
				{ type: 'pageLink', attrs: { pageId: target.id } },
				{ type: 'database', attrs: { databaseId: db.id } },
			],
		},
	});
	return { parent, p, target, child, db, sel, when };
}

const blockIds = (pageId: string) =>
	(
		sql().prepare('SELECT id FROM page_blocks WHERE page_id = ? ORDER BY position').all(pageId) as {
			id: string;
		}[]
	).map((r) => r.id);

describe('duplicatePage', () => {
	it('copies title, icon, parent, blocks with new ids and rebuilds links', () => {
		const { parent, p, target } = source();
		const copy = duplicatePage(u1, u1, p.id);
		expect(copy.title).toBe('Copy of Source page');
		expect(copy.parentId).toBe(parent.id);
		const src = blockIds(p.id);
		const made = blockIds(copy.id);
		expect(made).toHaveLength(src.length);
		expect(made.some((id) => src.includes(id))).toBe(false);
		const links = sql()
			.prepare('SELECT target_page_id AS t FROM page_links WHERE source_page_id = ?')
			.all(copy.id) as {
			t: string;
		}[];
		expect(links.map((l) => l.t)).toContain(target.id);
		expect((copy.doc.content as { type: string }[]).map((n) => n.type)).toEqual([
			'paragraph',
			'pageLink',
			'database',
		]);
	});
	it('copies database schema only: new db, props and view config remapped, no records', () => {
		const { p, db, sel, when } = source();
		const copy = duplicatePage(u1, u1, p.id);
		const node = (copy.doc.content as { type: string; attrs: { databaseId: string } }[]).find(
			(n) => n.type === 'database',
		) as { attrs: { databaseId: string } };
		expect(node.attrs.databaseId).not.toBe(db.id);
		const made = databases.get(u1, node.attrs.databaseId);
		const src = databases.get(u1, db.id);
		expect(made.props.map((x) => x.name)).toEqual(src.props.map((x) => x.name));
		const madeSel = made.props.find((x) => x.name === 'Status');
		expect(madeSel?.id).not.toBe(sel.id);
		const madeView = made.views.find((v) => v.name === 'Sorted');
		expect(madeView?.config.sort?.prop).toBe(madeSel?.id);
		const madeWhen = made.props.find((x) => x.name === 'When');
		expect(madeWhen?.id).not.toBe(when.id);
		expect(madeView?.config.groupBy).toBe(madeSel?.id);
		expect(madeView?.config.cardProps).toEqual([madeSel?.id]);
		expect(madeView?.config.dateProp).toBe(madeWhen?.id);
		expect(made.rows).toHaveLength(0);
		expect(src.rows).toHaveLength(1); // the source keeps its record
	});
	it('does not copy child pages', () => {
		const { p } = source();
		const before = (
			sql().prepare('SELECT count(*) AS n FROM pages WHERE owner_id = ?').get(u1) as { n: number }
		).n;
		const copy = duplicatePage(u1, u1, p.id);
		const after = (
			sql().prepare('SELECT count(*) AS n FROM pages WHERE owner_id = ?').get(u1) as { n: number }
		).n;
		expect(after).toBe(before + 1); // only the copy itself
		expect(
			(
				sql().prepare('SELECT count(*) AS n FROM pages WHERE parent_page_id = ?').get(copy.id) as {
					n: number;
				}
			).n,
		).toBe(0);
	});
	it("a shared page copies into the viewer's tree, parent top level, no shares", () => {
		const { p } = source();
		shares.put('page', u1, p.id, { username: 'two', permission: 'view' });
		const copy = duplicatePage(u2, u1, p.id);
		expect(copy.parentId).toBe(null); // u1's parent is not u2's page
		expect(pages.get(u2, copy.id).access).toBe('owner');
		expect((sql().prepare('SELECT count(*) AS n FROM page_shares WHERE page_id = ?').get(copy.id) as { n: number }).n).toBe(0); // prettier-ignore
		expect(copy.doc.content.length).toBe(3); // content copied even from a view share
	});

	it('Undo (route) clears the copy search hit and its attachment refs', async () => {
		const ATT = 'att_0000000000000001';
		sql()
			.prepare(
				`INSERT INTO attachments (id, owner_id, storage_key, original_name, mime_type, byte_size, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
			)
			.run(ATT, u1, 'aa'.repeat(16), 'p.png', 'image/png', 12, 'ready', nowUtcIso());
		const p = pages.create(u1, { parentId: null, title: 'Copy search source' });
		pages.update(u1, p.id, {
			doc: {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'searchable body' }] },
					{ type: 'image', attrs: { src: `/api/attachments/${ATT}`, alt: 'pic' } },
				],
			},
		});
		const user = usersRepo.safe(usersRepo.byId(u1)!);
		const res = await duplicatePost({ locals: { user }, params: { id: p.id } } as never);
		const j = (await res.json()) as { page: { id: string }; undo: { id: string } };
		const copyId = j.page.id;
		const hit = () => search.search(u1, 'Copy of Copy search source').some((h) => h.id === copyId);
		const refs = () =>
			(
				sql()
					.prepare(
						`SELECT count(*) AS n FROM attachment_refs WHERE source_type = 'page_block' AND source_id = ?`,
					)
					.get(copyId) as { n: number }
			).n;
		expect(hit()).toBe(true);
		expect(refs()).toBe(1);
		await undoPost({
			locals: { user },
			request: new Request('http://localhost/api/undo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: j.undo.id }),
			}),
			params: {},
		} as never);
		expect(hit()).toBe(false);
		expect(refs()).toBe(0);
		expect(() => pages.get(u1, copyId)).toThrow();
	});
});
