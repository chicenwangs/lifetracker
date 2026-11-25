// v4.0 PR 30: reminders on page to-dos — source pageId:blockId, tick/delete cancels on save, shares gate adding.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import { newId } from '../../src/lib/server/crypto';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as rem from '../../src/lib/server/reminders';
import { isoPlus, nowUtcIso } from '../../src/lib/time';

let u1: string;
let u2: string;
const sql = () => handle().sqlite;
const BID = 'pbl_aaaaaaaaaaaaaaaa';
const para = { type: 'paragraph', content: [{ type: 'text', text: 'Buy milk' }] };
const doc = (checked: boolean) => ({
	type: 'doc' as const,
	content: [
		{
			type: 'taskList',
			content: [{ type: 'taskItem', attrs: { checked, blockId: BID }, content: [para] }],
		},
	],
});
const due = () => isoPlus(nowUtcIso(), 3_600_000);
const status = (id: string) =>
	(sql().prepare(`SELECT status FROM reminders WHERE id = ?`).get(id) as { status: string }).status;
const share = (pageId: string, permission: 'view' | 'edit') =>
	sql()
		.prepare(
			`INSERT INTO page_shares (id, page_id, owner_id, grantee_id, permission, created_at) VALUES (?,?,?,?,?,?)`,
		)
		.run(newId('shr'), pageId, u1, u2, permission, nowUtcIso());

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

describe('page to-do reminders', () => {
	it('add on a to-do; ticking it on save cancels the reminder', () => {
		const p = pages.create(u1, { parentId: null, title: 'Todos' });
		pages.update(u1, p.id, { doc: doc(false) });
		const r = rem.add(u1, 'page_todo', `${p.id}:${BID}`, { at: due() });
		expect(r.status).toBe('scheduled');
		expect(Object.keys(rem.forPage(u1, p.id))).toEqual([BID]);
		pages.update(u1, p.id, { doc: doc(true) });
		expect(status(r.id)).toBe('cancelled');
	});
	it('un-ticking restores it; deleting the to-do cancels it', () => {
		const p = pages.create(u1, { parentId: null, title: 'Todos' });
		pages.update(u1, p.id, { doc: doc(false) });
		const r = rem.add(u1, 'page_todo', `${p.id}:${BID}`, { at: due() });
		pages.update(u1, p.id, { doc: doc(true) });
		expect(status(r.id)).toBe('cancelled');
		pages.update(u1, p.id, { doc: doc(false) });
		expect(status(r.id)).toBe('scheduled');
		pages.update(u1, p.id, { doc: { type: 'doc', content: [para] } });
		expect(status(r.id)).toBe('cancelled');
	});
	it('a stranger and a viewer are refused; an editor may add', () => {
		const p = pages.create(u1, { parentId: null, title: 'Todos' });
		pages.update(u1, p.id, { doc: doc(false) });
		expect(() => rem.add(u2, 'page_todo', `${p.id}:${BID}`, { at: due() })).toThrow();
		share(p.id, 'view');
		expect(() => rem.add(u2, 'page_todo', `${p.id}:${BID}`, { at: due() })).toThrow();
		sql().prepare(`UPDATE page_shares SET permission = 'edit' WHERE grantee_id = ?`).run(u2);
		const r = rem.add(u2, 'page_todo', `${p.id}:${BID}`, { at: due() });
		expect(r.status).toBe('scheduled');
		expect(Object.keys(rem.forPage(u2, p.id))).toEqual([BID]);
		expect(rem.forPage(u1, p.id)).toEqual({}); // reminders are private to whoever set them
	});
});
