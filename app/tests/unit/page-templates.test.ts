// v4.0 PR 22: page templates - out of the tree, searchable, new page from a template via the duplicate copier.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import type { PageDTO } from '$lib/types';
import * as shares from '../../src/lib/server/repo/shares';
import * as search from '../../src/lib/server/search';
import { duplicatePage } from '../../src/lib/server/repo/page-duplicate';
import { POST as templatePost } from '../../src/routes/api/pages/[id]/template/+server';
import { POST as fromTemplatePost } from '../../src/routes/api/pages/[id]/from-template/+server';
import { POST as undoPost } from '../../src/routes/api/undo/+server';

let u1: string;
let u2: string;
const body = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const event = (userId: string, id: string, b: unknown) => ({
	locals: { user: usersRepo.safe(usersRepo.byId(userId)!) },
	params: { id },
	request: new Request(`http://localhost/api/pages/${id}/x`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(b),
	}),
});
const undoEvent = (userId: string, id: string) => ({
	locals: { user: usersRepo.safe(usersRepo.byId(userId)!) },
	params: {},
	request: new Request('http://localhost/api/undo', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id }),
	}),
});
const textOf = (p: PageDTO) =>
	(p.doc.content[0] as { content?: { text?: string }[] }).content?.[0]?.text ?? '';

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

describe('page templates', () => {
	it('leaves the tree, lists under templates, stays searchable', () => {
		const p = pages.create(u1, { parentId: null, title: 'Meeting notes' });
		pages.update(u1, p.id, { doc: body('agenda needle') });
		pages.update(u1, p.id, { isTemplate: true });
		expect(pages.tree(u1).some((n) => n.id === p.id)).toBe(false);
		expect(pages.templates(u1).map((t) => t.id)).toEqual([p.id]);
		expect(search.search(u1, 'needle').some((h) => h.id === p.id)).toBe(true);
	});
	it('from template copies content, title and the chosen parent', () => {
		const tpl = pages.create(u1, { parentId: null, title: 'Signed form' });
		pages.update(u1, tpl.id, { doc: body('Sign here') });
		pages.update(u1, tpl.id, { isTemplate: true });
		const parent = pages.create(u1, { parentId: null, title: 'Projects' });
		const copy = duplicatePage(u1, u1, tpl.id, { title: 'Untitled Signed form', parentId: parent.id });
		expect(copy.title).toBe('Untitled Signed form');
		expect(copy.parentId).toBe(parent.id);
		expect(copy.isTemplate).toBe(false);
		expect(textOf(copy)).toBe('Sign here');
		expect(pages.tree(u1).some((n) => n.id === copy.id)).toBe(true);
		const theirs = pages.create(u2, { parentId: null, title: 'Not mine' });
		expect(() => duplicatePage(u1, u1, tpl.id, { parentId: theirs.id })).toThrow(); // only my parent
	});
	it('template toggle is owner-only and undoable (route)', async () => {
		const p = pages.create(u1, { parentId: null, title: 'Mine' });
		shares.put('page', u1, p.id, { username: 'two', permission: 'edit' });
		expect((await templatePost(event(u2, p.id, { isTemplate: true }) as never)).status).toBe(403); // editor, not owner
		const ok = (await (await templatePost(event(u1, p.id, { isTemplate: true }) as never)).json()) as {
			page: { isTemplate: boolean };
			undo: { id: string };
		};
		expect(ok.page.isTemplate).toBe(true);
		await undoPost(undoEvent(u1, ok.undo.id) as never);
		expect(pages.get(u1, p.id).isTemplate).toBe(false);
	});
	it('from-template route copies, and its undo removes the copy', async () => {
		const tpl = pages.create(u1, { parentId: null, title: 'Recipe' });
		pages.update(u1, tpl.id, { doc: body('Flour') });
		pages.update(u1, tpl.id, { isTemplate: true });
		const res = await fromTemplatePost(event(u1, tpl.id, { parentId: null }) as never);
		const j = (await res.json()) as {
			page: { id: string; title: string; isTemplate: boolean };
			undo: { id: string };
		};
		expect(j.page.title).toBe('Untitled Recipe');
		expect(j.page.isTemplate).toBe(false);
		expect(textOf(pages.get(u1, j.page.id))).toBe('Flour');
		await undoPost(undoEvent(u1, j.undo.id) as never);
		expect(() => pages.get(u1, j.page.id)).toThrow();
	});
});
