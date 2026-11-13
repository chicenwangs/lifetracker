// FEATURES PG-DB / PG-RECORDS / PG-SORTFILTER: PAGE-010..014, 021 (server side) + D-19.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as pages from '../../src/lib/server/repo/pages';
import * as dbs from '../../src/lib/server/repo/databases';
import { checkValue } from '../../src/lib/dbvalues';

let me: string;
let other: string;
beforeEach(() => {
	freshDb();
	const mk = (u: string) =>
		usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
	me = mk('jeremy');
	other = mk('neina');
});
const prop = (dbId: string, name: string, type: Parameters<typeof dbs.addProp>[2]['type'], options?: string[]) =>
	dbs.addProp(me, dbId, dbs.propCreateSchema.parse({ name, type, config: options ? { options: options.map((l, i) => ({ id: `o${i}`, label: l, color: '#ccc' })) } : {} })); // prettier-ignore
const titles = (d: ReturnType<typeof dbs.get>) => {
	const t = d.props.find((p) => p.type === 'title')?.id ?? '';
	return d.rows.map((r) => r.values[t]);
};

describe('Databases', () => {
	it('PAGE-011: new database gets a Title property and a table view, on its own page', () => {
		const { id, pageId } = dbs.create(me, { pageId: null, title: 'Workouts' });
		const d = dbs.get(me, id);
		expect(d.props.map((p) => p.type)).toEqual(['title']);
		expect(d.views.map((v) => v.type)).toEqual(['table']);
		expect(pages.get(me, pageId).doc.content).toEqual([{ type: 'database', attrs: { databaseId: id } }]);
	});

	it('PAGE-012/013: number rejects text; records keep their values', () => {
		const { id } = dbs.create(me, { pageId: null, title: 'W' });
		const kg = prop(id, 'kg', 'number');
		const r = dbs.addRecord(me, id);
		expect(() => dbs.setValues(me, r.id, { [kg.id]: 'heavy' })).toThrow(/kg: Number/);
		dbs.setValues(me, r.id, { [kg.id]: '62.5' });
		expect(dbs.get(me, id).rows[0]?.values[kg.id]).toBe(62.5);
		expect(checkValue('url', 'javascript:alert(1)').ok).toBe(false);
		expect(checkValue('date', '2026-02-30').ok).toBe(false);
	});

	it('PAGE-014: sort + filter are correct and stay on the view', () => {
		const { id } = dbs.create(me, { pageId: null, title: 'W' });
		const d0 = dbs.get(me, id);
		const t = d0.props[0]?.id as string;
		const kg = prop(id, 'kg', 'number');
		const day = prop(id, 'Day', 'select', ['Push', 'Pull']);
		for (const [n, w, s] of [['Bench', 60, 'o0'], ['Row', 50, 'o1'], ['Press', 40, 'o0'], ['Curl', null, 'o1']] as const)
			dbs.addRecord(me, id, { [t]: n, [kg.id]: w, [day.id]: s });
		dbs.patchView(me, d0.viewId, { config: { sort: { prop: kg.id, dir: 'desc' } } });
		expect(titles(dbs.get(me, id))).toEqual(['Bench', 'Row', 'Press', 'Curl']); // empty last
		dbs.patchView(me, d0.viewId, { config: { sort: { prop: kg.id, dir: 'asc' }, filters: [{ prop: day.id, op: 'is', value: 'o0' }] } });
		expect(titles(dbs.get(me, id))).toEqual(['Press', 'Bench']);
		dbs.patchView(me, d0.viewId, { config: { conj: 'or', filters: [{ prop: kg.id, op: 'gt', value: 55 }, { prop: kg.id, op: 'is_empty' }] } });
		expect(titles(dbs.get(me, id)).sort()).toEqual(['Bench', 'Curl']);
		expect(() => dbs.patchView(me, d0.viewId, { config: { filters: [{ prop: kg.id, op: 'contains', value: 'x' }] } })).toThrow(/does not fit/);
	}); // prettier-ignore

	it('PAGE-015: record opens as a page (same identity every time); title syncs both ways; not in the sidebar', () => {
		const { id, pageId } = dbs.create(me, { pageId: null, title: 'W' });
		const t = dbs.get(me, id).props[0]?.id as string;
		const r = dbs.addRecord(me, id, { [t]: 'Leg day' });
		const p1 = dbs.recordPage(me, r.id);
		expect(dbs.recordPage(me, r.id)).toBe(p1);
		expect(pages.get(me, p1).title).toBe('Leg day');
		expect(pages.get(me, p1).parentId).toBe(pageId);
		dbs.setValues(me, r.id, { [t]: 'Legs' });
		expect(pages.get(me, p1).title).toBe('Legs');
		dbs.syncTitleFromPage(p1, 'Squats');
		expect(dbs.get(me, id).rows[0]?.values[t]).toBe('Squats');
		expect(pages.tree(me).map((n) => n.id)).not.toContain(p1);
		dbs.deleteRecord(me, r.id);
		expect(() => pages.get(me, p1)).toThrow(/Not found/); // in Trash with the record
	});

	it('D-19: type change that breaks values needs confirm; values kept + flagged, never rewritten', () => {
		const { id } = dbs.create(me, { pageId: null, title: 'W' });
		const note = prop(id, 'Note', 'text');
		const r = dbs.addRecord(me, id, { [note.id]: 'heavy' });
		expect(() => dbs.patchProp(me, note.id, { type: 'number' })).toThrow(/1 value won't fit/);
		dbs.patchProp(me, note.id, { type: 'number', confirm: true });
		const row = dbs.get(me, id).rows[0];
		expect(row?.values[note.id]).toBe('heavy');
		expect(row?.invalid).toEqual([note.id]);
		expect(() => dbs.deleteProp(me, note.id, false)).toThrow(/removes 1 value/);
		dbs.deleteProp(me, note.id, true);
		expect(dbs.get(me, id).props).toHaveLength(1);
		expect(() => dbs.deleteProp(me, dbs.get(me, id).props[0]?.id as string, true)).toThrow(/title property/);
		void r;
	});

	it('PAGE-021: a workout tracker is buildable (props of every kind, one record per set)', () => {
		const { id } = dbs.create(me, { pageId: null, title: 'Workout log' });
		const t = dbs.get(me, id).props[0]?.id as string;
		const ps = {
			date: prop(id, 'Date', 'date'),
			kg: prop(id, 'kg', 'number'),
			reps: prop(id, 'Reps', 'number'),
			effort: prop(id, 'Effort', 'select', ['light', 'moderate', 'heavy']),
			tags: prop(id, 'Muscles', 'multi_select', ['chest', 'triceps', 'back']),
			pr: prop(id, 'PR', 'checkbox'),
			video: prop(id, 'Form video', 'url'),
			notes: prop(id, 'Notes', 'text'),
		};
		dbs.addRecord(me, id, { [t]: 'Bench', [ps.date.id]: '2026-11-13', [ps.kg.id]: 62.5, [ps.reps.id]: 5, [ps.effort.id]: 'o2', [ps.tags.id]: ['o0', 'o1', 'o0'], [ps.pr.id]: true, [ps.video.id]: 'https://example.com/v', [ps.notes.id]: 'felt good' }); // prettier-ignore
		const row = dbs.get(me, id).rows[0];
		expect(row?.values[ps.tags.id]).toEqual(['o0', 'o1']); // deduped
		expect(row?.invalid).toBeUndefined();
	});

	it("someone else can't read or write my database, records or views", () => {
		const { id } = dbs.create(me, { pageId: null, title: 'W' });
		const r = dbs.addRecord(me, id);
		const v = dbs.get(me, id).viewId;
		expect(() => dbs.get(other, id)).toThrow(/Not found/);
		expect(() => dbs.setValues(other, r.id, {})).toThrow(/Not found/);
		expect(() => dbs.recordPage(other, r.id)).toThrow(/Not found/);
		expect(() => dbs.patchView(other, v, { name: 'x' })).toThrow(/Not found/);
		expect(() => dbs.create(other, { pageId: dbs.get(me, id).pageId, title: 'x' })).toThrow(/Not found/);
	});
});
