// Card 16 (D-V4-22): page emoji icon — strict schema, findByTitle + graph carry it, the real PATCH route
// journals the pages row, and undo puts the icon back without rolling pages.revision back (no false 409).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as shares from '../../src/lib/server/repo/shares';
import { graph } from '../../src/lib/server/graph';
import { undo } from '../../src/lib/server/undo';
import { ApiFail } from '../../src/lib/server/http';
import { PATCH } from '../../src/routes/api/pages/[id]/+server';

let owner: App.SafeUser;
let viewer: App.SafeUser;
let stranger: App.SafeUser;
const mk = (u: string) => {
	const r = usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' });
	return usersRepo.safe(r);
};
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	owner = mk('jeremy');
	viewer = mk('vee');
	stranger = mk('sam');
});

const doc = (...content: unknown[]) => ({ type: 'doc' as const, content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const link = (pageId: string) => ({ type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId } }] });
const row = (id: string) =>
	handle().sqlite.prepare(`SELECT * FROM pages WHERE id = ?`).get(id) as {
		icon: string | null;
		revision: number;
	};
const blocks = (id: string) =>
	handle()
		.sqlite.prepare(`SELECT id, content_json FROM page_blocks WHERE page_id = ? ORDER BY position`)
		.all(id) as {
		id: string;
		content_json: string;
	}[];
const undoCount = () =>
	(handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;

/** the real PATCH route, as the given signed-in user */
const patchRoute = async (user: App.SafeUser, id: string, b: unknown) => {
	const url = `http://localhost/api/pages/${id}`;
	const res = await PATCH({
		params: { id },
		locals: { user },
		url: new URL(url),
		request: new Request(url, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(b),
		}),
	} as unknown as Parameters<typeof PATCH>[0]);
	return {
		status: res.status,
		json: (await res.json()) as {
			page?: { icon: string | null; revision: number };
			undo?: { id: string; label: string };
			error?: { code: string; message: string };
		},
	};
};

describe('C3 icon schema and the PATCH route', () => {
	it('C3 patchSchema takes icon (max 8, nullable) and rejects loose fields', () => {
		expect(pages.patchSchema.safeParse({ icon: '📄' }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ icon: null }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ icon: '12345678' }).success).toBe(true);
		expect(pages.patchSchema.safeParse({ icon: '123456789' }).success).toBe(false);
		expect(pages.patchSchema.safeParse({ icon: '📄', cover: 'x' }).success).toBe(false);
	});

	it('C3 the route sets, keeps through a re-read and removes the icon; only the icon change journals', async () => {
		const p = pages.create(owner.id, { parentId: null, title: 'Icon route' });
		const before = undoCount();
		const set = await patchRoute(owner, p.id, { icon: '📄' });
		expect(set.status).toBe(200);
		expect(set.json.page?.icon).toBe('📄');
		expect(set.json.undo?.label).toBe('Icon "Icon route"');
		expect(undoCount()).toBe(before + 1);
		expect(pages.get(owner.id, p.id).icon).toBe('📄'); // survives a reload
		// a title-only PATCH is the old path: no journal row for autosaves
		expect((await patchRoute(owner, p.id, { title: 'Renamed' })).json.undo).toBeUndefined();
		expect(undoCount()).toBe(before + 1);
		const gone = await patchRoute(owner, p.id, { icon: null });
		expect(gone.json.page?.icon).toBeNull();
		expect(pages.get(owner.id, p.id).icon).toBeNull();
	});

	it('C3 an icon longer than 8 characters is refused with a 400 and nothing is written', async () => {
		const p = pages.create(owner.id, { parentId: null, title: 'Too long' });
		const r = await patchRoute(owner, p.id, { icon: '123456789' });
		expect(r.status).toBe(400);
		expect(row(p.id).icon).toBeNull();
	});
});

describe('C4 icon data for the list surfaces', () => {
	it('C4 findByTitle and the graph node carry the icon (null when unset)', () => {
		const a = pages.create(owner.id, { parentId: null, title: 'Trip plan' });
		const b = pages.create(owner.id, { parentId: null, title: 'Trip notes' });
		pages.update(owner.id, b.id, { icon: '📚' });
		const hits = pages.findByTitle(owner.id, 'Trip');
		expect(hits.map((h) => [h.title, h.icon]).sort()).toEqual([
			['Trip notes', '📚'],
			['Trip plan', null],
		]);
		const g = graph(owner.id);
		expect(g.nodes.find((n) => n.id === a.id)?.icon).toBeNull();
		expect(g.nodes.find((n) => n.id === b.id)?.icon).toBe('📚');
	});
});

describe('C5 the icon change is independent of the editor', () => {
	it('C5 it rewrites no page_blocks and touches no page_links', async () => {
		const other = pages.create(owner.id, { parentId: null, title: 'Target' });
		const p = pages.create(owner.id, { parentId: null, title: 'Body' });
		pages.update(owner.id, p.id, { doc: doc(para('kept text'), link(other.id)) });
		const before = blocks(p.id);
		const links = () =>
			(handle().sqlite.prepare('SELECT count(*) AS n FROM page_links').get() as { n: number }).n;
		const linksBefore = links();
		expect((await patchRoute(owner, p.id, { icon: '🧪' })).status).toBe(200);
		expect(blocks(p.id)).toEqual(before);
		expect(links()).toBe(linksBefore);
	});
});

describe('C7 permissions', () => {
	it('C7 view-only is 403, a page I cannot see is 404, and a write never crosses owners', async () => {
		const p = pages.create(owner.id, { parentId: null, title: 'Shared' });
		shares.put('page', owner.id, p.id, { username: 'vee', permission: 'view' });
		expect((await patchRoute(viewer, p.id, { icon: '📄' })).status).toBe(403);
		expect((await patchRoute(stranger, p.id, { icon: '📄' })).status).toBe(404);
		expect(row(p.id).icon).toBeNull();
		// a partner's own page carries their icon; my page never changes with it
		const theirs = pages.create(stranger.id, { parentId: null, title: 'Theirs' });
		expect((await patchRoute(stranger, theirs.id, { icon: '🔥' })).status).toBe(200);
		expect(row(theirs.id).icon).toBe('🔥');
		expect(row(p.id).icon).toBeNull();
		expect(() => pages.update(stranger.id, p.id, { icon: '🔥' })).toThrow(ApiFail);
	});
});

describe('C8 undo', () => {
	it('C8 Undo restores the previous icon (or none), keeps the revision, and the next save is no 409', async () => {
		const p = pages.create(owner.id, { parentId: null, title: 'Undo icon' });
		pages.update(owner.id, p.id, { icon: '📄' });
		const beforeRevision = row(p.id).revision;
		const set = await patchRoute(owner, p.id, { icon: '📚' });
		const afterRevision = row(p.id).revision;
		expect(afterRevision).toBe(beforeRevision + 1);
		pages.get(owner.id, p.id); // the client re-reads the page after a save: last_opened_at moves
		undo(owner.id, set.json.undo?.id);
		expect(row(p.id).icon).toBe('📄');
		// D-V4-22: undo must not write the old revision back (the editor still holds the newer one)
		expect(row(p.id).revision).toBe(afterRevision);
		expect(set.json.page?.revision).toBe(afterRevision);
		// the next text save with the revision the client knows is accepted, not a 409
		const saved = pages.update(owner.id, p.id, { doc: doc(para('after undo')), revision: afterRevision });
		expect(saved.revision).toBe(afterRevision + 1);

		// removing: the undo brings the icon back too
		const removed = await patchRoute(owner, p.id, { icon: null });
		expect(row(p.id).icon).toBeNull();
		undo(owner.id, removed.json.undo?.id);
		expect(row(p.id).icon).toBe('📄');

		// and with no previous icon the undo leaves it empty
		const plain = pages.create(owner.id, { parentId: null, title: 'Plain' });
		const first = await patchRoute(owner, plain.id, { icon: '⭐' });
		undo(owner.id, first.json.undo?.id);
		expect(row(plain.id).icon).toBeNull();
		expect(row(plain.id).revision).toBe(first.json.page?.revision); // D-V4-22: kept, not the old number
	});

	it('C8 a real edit since the icon change still blocks the undo', async () => {
		const p = pages.create(owner.id, { parentId: null, title: 'Guarded' });
		const set = await patchRoute(owner, p.id, { icon: '📄' });
		pages.update(owner.id, p.id, { title: 'Renamed since' });
		let status = 0;
		try {
			undo(owner.id, set.json.undo?.id);
		} catch (e) {
			status = (e as ApiFail).status;
		}
		expect(status).toBe(409);
		expect(row(p.id).icon).toBe('📄');
	});
});
