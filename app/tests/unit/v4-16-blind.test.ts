// Blind test for card 16 (page emoji icon), written from its Done-when lines only.
// Everything runs on an in-memory DB; the icon PATCH and the undo POST go through their real route
// handlers, the rest through the owner-scoped repo. No builder test was opened.
import { beforeEach, describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as shares from '../../src/lib/server/repo/shares';
import { graph } from '../../src/lib/server/graph';
import { PATCH as pagePatch } from '../../src/routes/api/pages/[id]/+server';
import { POST as undoPost } from '../../src/routes/api/undo/+server';

let owner: string;
let viewer: string;
let editor: string;
let partner: string;
let stranger: string;

beforeEach(() => {
	freshDb();
	const mk = (u: string) =>
		usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
	owner = mk('jeremy');
	viewer = mk('vee');
	editor = mk('eddie');
	partner = mk('neina');
	stranger = mk('sam');
});

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const link = (pageId: string) => ({ type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId } }] });
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const page = (title: string, icon: string | null = null) => {
	const p = pages.create(owner, pages.createSchema.parse({ title }));
	if (icon) pages.update(owner, p.id, { icon });
	return pages.get(owner, p.id, false);
};

interface Reply {
	page?: { id: string; icon: string | null; revision: number; title: string };
	undo?: { id: string; label: string };
	error?: { code: string; message: string };
	label?: string;
}
const user = (id: string) =>
	({ id, username: id, displayName: id, role: 'member' }) as unknown as App.SafeUser;
/** a RequestEvent with just what the two handlers read: locals.user, params.id, request */
function event(userId: string, id: string, method: 'PATCH' | 'POST', body: unknown): RequestEvent {
	return {
		locals: { user: user(userId) },
		params: { id },
		request: new Request(`http://localhost/api/${id}`, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	} as unknown as RequestEvent;
}
async function patchPage(ownerId: string, id: string, body: unknown) {
	const res = await pagePatch(event(ownerId, id, 'PATCH', body));
	return { status: res.status, json: (await res.json()) as Reply };
}
async function undoIcon(ownerId: string, undoId?: string) {
	const res = await undoPost(event(ownerId, '', 'POST', undoId ? { id: undoId } : {}));
	return { status: res.status, json: (await res.json()) as Reply };
}
const rows = <T>(sql: string, ...args: unknown[]): T[] =>
	handle()
		.sqlite.prepare(sql)
		.all(...args) as T[];
const undoCount = () =>
	(handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;
const iconOf = (id: string) =>
	(handle().sqlite.prepare('SELECT icon FROM pages WHERE id = ?').get(id) as { icon: string | null }).icon;

// ---- C3 ----------------------------------------------------------------------------------------------------
describe('C3 patchSchema and the icon PATCH route', () => {
	it('C3 patchSchema takes icon up to 8 chars or null and refuses every other shape (strict)', () => {
		expect(pages.patchSchema.safeParse({ icon: '📄' }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ icon: null }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ icon: 'x'.repeat(8) }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ icon: 'x'.repeat(9) }).success).toBe(false);
		expect(pages.patchSchema.safeParse({ icon: 5 }).success).toBe(false);
		expect(pages.patchSchema.safeParse({ icon: '📄', junk: 1 }).success).toBe(false);
		expect(pages.patchSchema.safeParse({}).success).toBe(true); // partial: title/doc/revision style PATCH still works
	});

	it('C3 PATCH /api/pages/:id { icon } stores it and returns the page + its undo; bad bodies write nothing', async () => {
		const p = page('Blind16 C3');
		const set = await patchPage(owner, p.id, { icon: '📚' });
		expect(set.status, JSON.stringify(set.json)).toBe(200);
		expect(set.json.page).toMatchObject({ id: p.id, icon: '📚', revision: p.revision + 1 });
		expect(set.json.undo?.id).toMatch(/^und_/);
		expect(iconOf(p.id)).toBe('📚');

		const removed = await patchPage(owner, p.id, { icon: null });
		expect(removed.status).toBe(200);
		expect(removed.json.page?.icon).toBeNull();
		expect(iconOf(p.id)).toBeNull();

		for (const bad of [{ icon: 'x'.repeat(9) }, { icon: 5 }, { icon: '📄', junk: 1 }]) {
			const r = await patchPage(owner, p.id, bad);
			expect(r.status, JSON.stringify(bad)).toBe(400);
			expect(r.json.error?.code).toBe('bad_request');
		}
		expect(iconOf(p.id)).toBeNull(); // still the last good value
	});
});

// ---- C4 ----------------------------------------------------------------------------------------------------
describe('C4 the icon in findByTitle and the graph', () => {
	it('C4 findByTitle carries the icon (null when unset) and keeps the archived mark', () => {
		const a = page('Blind16 Alpha', '📚');
		const b = page('Blind16 Beta');
		const found = new Map(pages.findByTitle(owner, 'Blind16').map((r) => [r.id, r]));
		expect(found.get(a.id)).toMatchObject({ title: 'Blind16 Alpha', icon: '📚', archived: 0 });
		expect(found.get(b.id)).toMatchObject({ title: 'Blind16 Beta', icon: null, archived: 0 });

		pages.archive(owner, b.id);
		const after = pages.findByTitle(owner, 'Blind16 Beta').find((r) => r.id === b.id)!;
		expect(after).toMatchObject({ icon: null, archived: 1 });
	});

	it('C4 graph nodes carry the icon for my pages only; archived and normal marking unchanged', () => {
		const live = page('Blind16 Live', '🎓');
		const archived = page('Blind16 Old', '📗');
		pages.archive(owner, archived.id);
		pages.create(partner, pages.createSchema.parse({ title: 'Blind16 Theirs' })); // other owner: never a node

		const g = graph(owner);
		const node = (id: string) => g.nodes.find((n) => n.id === id)!;
		expect(node(live.id)).toMatchObject({ title: 'Blind16 Live', icon: '🎓', archived: false, kind: 'page' });
		expect(node(archived.id)).toMatchObject({
			title: 'Blind16 Old',
			icon: '📗',
			archived: true,
			kind: 'page',
		});
		expect(Object.keys(node(live.id)).sort()).toEqual([
			'archived',
			'icon',
			'id',
			'kind',
			'parentId',
			'title',
		]);
		expect(g.nodes.every((n) => n.title !== 'Blind16 Theirs')).toBe(true);
	});
});

// ---- C5 ----------------------------------------------------------------------------------------------------
describe('C5 the icon change is independent of the editor', () => {
	it('C5 icon PATCH rewrites no page_blocks, touches no page_links, and the editor revision still lines up', async () => {
		const target = page('Blind16 Link target');
		const source = page('Blind16 Source');
		const first = doc(para('text before the icon'), link(target.id));
		pages.update(owner, source.id, { doc: first });
		const blocks = rows('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY id', source.id);
		const links = rows('SELECT * FROM page_links WHERE source_page_id = ? ORDER BY id', source.id);
		expect(blocks.length).toBe(2);
		expect(links.length).toBe(1);

		const set = await patchPage(owner, source.id, { icon: '🧠' });
		expect(set.status).toBe(200);
		expect(rows('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY id', source.id)).toEqual(blocks);
		expect(rows('SELECT * FROM page_links WHERE source_page_id = ? ORDER BY id', source.id)).toEqual(links);
		expect(pages.get(owner, source.id, false).doc).toEqual(first);

		// the editor got the icon's revision: its pending text save is accepted, not a 409
		const typed = doc(para('the text typed before the icon was picked'));
		const saved = await patchPage(owner, source.id, { doc: typed, revision: set.json.page!.revision });
		expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		expect(pages.get(owner, source.id, false).doc).toEqual(typed);
	});
});

// ---- C7 ----------------------------------------------------------------------------------------------------
describe('C7 permissions on the icon write', () => {
	it('C7 a page I cannot see is 404, a view-only share is 403, and an edit share can change it', async () => {
		const p = page('Blind16 Secret');
		shares.put('page', owner, p.id, { username: 'vee', permission: 'view' });
		shares.put('page', owner, p.id, { username: 'eddie', permission: 'edit' });

		const unseen = await patchPage(stranger, p.id, { icon: '🔥' });
		expect(unseen.status).toBe(404);
		expect(unseen.json.error?.message).toBe('Not found');
		expect(iconOf(p.id)).toBeNull();

		const readOnly = await patchPage(viewer, p.id, { icon: '🔥' });
		expect(readOnly.status).toBe(403);
		expect(readOnly.json.error?.message).toBe('You can view this, not edit it.');
		expect(iconOf(p.id)).toBeNull();

		const byEditor = await patchPage(editor, p.id, { icon: '🌱' });
		expect(byEditor.status).toBe(200);
		expect(iconOf(p.id)).toBe('🌱'); // it is the owner's page row, written through the editor's access
	});

	it("C7 each write is scoped to the owner: another user's page is 404 and never changes mine", async () => {
		const theirs = pages.create(partner, pages.createSchema.parse({ title: 'Blind16 Theirs' }));
		const mine = page('Blind16 Mine');

		const cross = await patchPage(owner, theirs.id, { icon: '🔥' });
		expect(cross.status).toBe(404);
		expect(cross.json.error?.message).toBe('Not found');
		expect(iconOf(theirs.id)).toBeNull();

		const own = await patchPage(partner, theirs.id, { icon: '🌱' });
		expect(own.status).toBe(200);
		expect(iconOf(theirs.id)).toBe('🌱');
		expect(iconOf(mine.id)).toBeNull();
	});
});

// ---- C8 ----------------------------------------------------------------------------------------------------
describe('C8 undo restores the icon without rolling the revision back', () => {
	it('C8 setting then undoing the icon returns the old icon and the next text save is not a 409', async () => {
		const p = page('Blind16 C8');
		const set = await patchPage(owner, p.id, { icon: '📚' });
		expect(set.status).toBe(200);
		const iconRevision = set.json.page!.revision;
		const undoId = set.json.undo!.id;
		expect(set.json.undo!.label).toContain('Icon');

		const undone = await undoIcon(owner, undoId);
		expect(undone.status, JSON.stringify(undone.json)).toBe(200);
		const after = pages.get(owner, p.id, false);
		expect(after.icon).toBeNull(); // previous icon (none) back
		expect(after.revision).toBe(iconRevision); // D-V4-22: the revision is not rolled back

		// the editor kept iconRevision: its next text save passes the optimistic lock
		const saved = await patchPage(owner, p.id, {
			doc: doc(para('typed after the undo')),
			revision: iconRevision,
		});
		expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		expect(pages.get(owner, p.id, false).doc).toEqual(doc(para('typed after the undo')));
	});

	it('C8 removing an icon undoes back to the previous icon, and a real edit blocks the undo (409)', async () => {
		const p = page('Blind16 C8b', '🎓');
		const removed = await patchPage(owner, p.id, { icon: null });
		expect(removed.status).toBe(200);
		expect(iconOf(p.id)).toBeNull();
		const back = await undoIcon(owner, removed.json.undo!.id);
		expect(back.status).toBe(200);
		expect(iconOf(p.id)).toBe('🎓');

		// a genuine text edit after the icon change: the snapshot no longer matches, so undo refuses
		const set = await patchPage(owner, p.id, { icon: '📗' });
		expect(set.status).toBe(200);
		const real = await patchPage(owner, p.id, {
			doc: doc(para('a real edit happened')),
			revision: set.json.page!.revision,
		});
		expect(real.status).toBe(200);

		const blocked = await undoIcon(owner, set.json.undo!.id);
		expect(blocked.status).toBe(409);
		expect(blocked.json.error?.message).toContain("Can't undo safely");
		expect(iconOf(p.id)).toBe('📗'); // nothing half-restored
	});
});

// ---- C9 ----------------------------------------------------------------------------------------------------
describe('C9 a failed icon write leaves no half state', () => {
	it('C9 a refused PATCH (stale revision / bad body) keeps the old icon, revision and blocks, and journals nothing', async () => {
		const target = page('Blind16 C9 target');
		const p = page('Blind16 C9');
		pages.update(owner, p.id, { doc: doc(para('stable text'), link(target.id)) });
		const before = pages.get(owner, p.id, false);
		const blocks = rows('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY id', p.id);
		const links = rows('SELECT * FROM page_links WHERE source_page_id = ? ORDER BY id', p.id);
		const journals = undoCount();

		const stale = await patchPage(owner, p.id, { icon: '🔥', revision: before.revision + 5 });
		expect(stale.status).toBe(409);
		expect(stale.json.error?.code).toBe('conflict');

		for (const bad of [{ icon: 'x'.repeat(9) }, { icon: '📄', junk: true }]) {
			const r = await patchPage(owner, p.id, bad);
			expect(r.status).toBe(400);
		}

		const after = pages.get(owner, p.id, false);
		expect(after.icon).toBeNull();
		expect(after.revision).toBe(before.revision);
		expect(after.updatedAt).toBe(before.updatedAt);
		expect(rows('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY id', p.id)).toEqual(blocks);
		expect(rows('SELECT * FROM page_links WHERE source_page_id = ? ORDER BY id', p.id)).toEqual(links);
		expect(undoCount()).toBe(journals);
	});
});
