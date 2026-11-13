// Databases (FEATURES PG-DB/RECORDS/SORTFILTER, DESIGN §7, ADR-004). Rows, not JSON: props, records, values, views.
// Filtering/sorting runs in app code over the database's records (DESIGN §7 allows it for small DBs; capped).
import { z } from 'zod';
import { handle, txImmediate } from '../db';
import { newId } from '../crypto';
import { ApiFail, bad, notFound } from '../http';
import * as pages from './pages';
import {
	checkValue,
	compare,
	matches,
	NO_VALUE_OPS,
	OPS,
	PROP_TYPES,
	type PropConfig,
	type PropType,
	type ViewConfig,
} from '$lib/dbvalues';
import { nowUtcIso } from '$lib/time';
import type { DatabaseDTO, DbProp, DbRow, DbView } from '$lib/types';

export const MAX_RECORDS = 5000; // shortcut: in-memory filter/sort over all records; add an indexed projection past this
export const MAX_PROPS = 50;
const db = () => handle().sqlite;
const now = () => nowUtcIso();

type DbRowRaw = { id: string; owner_id: string; page_id: string; title: string; revision: number };
type PropRaw = {
	id: string;
	database_id: string;
	name: string;
	property_type: PropType;
	config_json: string;
	position: number;
};

function own(ownerId: string, id: string): DbRowRaw {
	const r = db().prepare(`SELECT d.* FROM page_databases d JOIN pages p ON p.id = d.page_id WHERE d.id = ? AND d.owner_id = ? AND p.deleted_at IS NULL`).get(id, ownerId) as DbRowRaw | undefined; // prettier-ignore
	return r ?? notFound();
}
function propOf(ownerId: string, propId: string): PropRaw {
	const p = db().prepare(`SELECT pr.* FROM database_properties pr JOIN page_databases d ON d.id = pr.database_id WHERE pr.id = ? AND d.owner_id = ?`).get(propId, ownerId) as PropRaw | undefined; // prettier-ignore
	return p ?? notFound();
}
function recordOf(ownerId: string, recordId: string) {
	const r = db().prepare(`SELECT r.* FROM database_records r JOIN page_databases d ON d.id = r.database_id WHERE r.id = ? AND d.owner_id = ?`).get(recordId, ownerId) as { id: string; database_id: string; page_id: string | null } | undefined; // prettier-ignore
	return r ?? notFound();
}
const props = (dbId: string): DbProp[] =>
	(db().prepare(`SELECT * FROM database_properties WHERE database_id = ? ORDER BY position`).all(dbId) as PropRaw[]).map((p) => ({ id: p.id, name: p.name, type: p.property_type, config: JSON.parse(p.config_json) as PropConfig })); // prettier-ignore
const views = (dbId: string): DbView[] =>
	(db().prepare(`SELECT * FROM database_views WHERE database_id = ? ORDER BY position`).all(dbId) as { id: string; name: string; view_type: DbView['type']; config_json: string }[]).map((v) => ({ id: v.id, name: v.name, type: v.view_type, config: JSON.parse(v.config_json) as ViewConfig })); // prettier-ignore
const maxPos = (sql: string, a: string) => ((db().prepare(sql).get(a) as { m: number | null }).m ?? 0) + 1;

// ---------- create ----------
/** new database on a page I own (an inline block), or on a new page of its own (pageId = null). Title prop + table view. */
export function create(
	ownerId: string,
	o: { pageId: string | null; title: string },
): { id: string; pageId: string } {
	return txImmediate(() => {
		let pageId = o.pageId;
		if (pageId) pages.get(ownerId, pageId, false);
		else pageId = pages.create(ownerId, { parentId: null, title: o.title }).id;
		const id = newId('pdb');
		const t = now();
		db().prepare(`INSERT INTO page_databases (id, owner_id, page_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, ownerId, pageId, o.title, t, t); // prettier-ignore
		db().prepare(`INSERT INTO database_properties (id, database_id, name, property_type, position, created_at, updated_at) VALUES (?, ?, 'Name', 'title', 0, ?, ?)`).run(newId('pdp'), id, t, t); // prettier-ignore
		db().prepare(`INSERT INTO database_views (id, database_id, name, view_type, config_json, position) VALUES (?, ?, 'Table', 'table', '{}', 0)`).run(newId('pdv'), id); // prettier-ignore
		if (!o.pageId)
			pages.update(ownerId, pageId, {
				doc: { type: 'doc', content: [{ type: 'database', attrs: { databaseId: id } }] },
			});
		return { id, pageId };
	});
}

// ---------- read ----------
/** the database with one view applied (filters + sort run here), paged */
export function get(
	ownerId: string,
	id: string,
	o: { viewId?: string; offset?: number; limit?: number } = {},
): DatabaseDTO {
	const d = own(ownerId, id);
	const ps = props(id);
	const vs = views(id);
	const view = vs.find((v) => v.id === o.viewId) ?? vs[0];
	const recs = db().prepare(`SELECT id, page_id FROM database_records WHERE database_id = ? ORDER BY position LIMIT ?`).all(id, MAX_RECORDS) as { id: string; page_id: string | null }[]; // prettier-ignore
	const vals = db().prepare(`SELECT v.record_id, v.property_id, v.value_json FROM database_values v JOIN database_records r ON r.id = v.record_id WHERE r.database_id = ?`).all(id) as { record_id: string; property_id: string; value_json: string }[]; // prettier-ignore
	const byRec = new Map<string, Record<string, unknown>>();
	for (const v of vals)
		(byRec.get(v.record_id) ?? byRec.set(v.record_id, {}).get(v.record_id) ?? {})[v.property_id] = JSON.parse(
			v.value_json,
		);
	let rows: DbRow[] = recs.map((r) => {
		const values = byRec.get(r.id) ?? {};
		// D-19: a value that no longer fits its property's type is kept as is and flagged, never rewritten
		const invalid = ps
			.filter((p) => values[p.id] !== undefined && !checkValue(p.type, values[p.id], p.config).ok)
			.map((p) => p.id);
		return { id: r.id, pageId: r.page_id, values, ...(invalid.length ? { invalid } : {}) };
	});
	const cfg = view?.config ?? {};
	const typeOf = (pid: string) => ps.find((p) => p.id === pid);
	const fs = (cfg.filters ?? []).filter((f) => typeOf(f.prop));
	if (fs.length) {
		const ok = (r: DbRow) => fs.map((f) => { const p = typeOf(f.prop) as DbProp; return matches(p.type, f.op, r.values[p.id] ?? null, f.value, p.config); }); // prettier-ignore
		rows = rows.filter((r) => (cfg.conj === 'or' ? ok(r).some(Boolean) : ok(r).every(Boolean)));
	}
	const sp = cfg.sort && typeOf(cfg.sort.prop);
	if (sp && cfg.sort) {
		const dir = cfg.sort.dir === 'desc' ? -1 : 1;
		rows = [...rows].sort((a, b) => {
			const av = a.values[sp.id] ?? null;
			const bv = b.values[sp.id] ?? null;
			const e = (av === null) !== (bv === null);
			return e ? (av === null ? 1 : -1) : dir * compare(sp.type, av, bv, sp.config); // empties last both ways
		});
	}
	const limit = Math.min(o.limit ?? 100, 500);
	const offset = Math.max(0, o.offset ?? 0);
	return { id: d.id, title: d.title, pageId: d.page_id, props: ps, views: vs, viewId: view?.id ?? '', rows: rows.slice(offset, offset + limit), total: rows.length }; // prettier-ignore
}

// ---------- schema: properties ----------
export const propCreateSchema = z.object({ name: z.string().trim().min(1).max(100), type: z.enum(PROP_TYPES), config: z.object({ options: z.array(z.object({ id: z.string().max(40), label: z.string().trim().min(1).max(100), color: z.string().max(20) }).strict()).max(100).optional() }).strict().default({}) }).strict(); // prettier-ignore
export const propPatchSchema = z.object({ name: z.string().trim().min(1).max(100), type: z.enum(PROP_TYPES), config: propCreateSchema.shape.config, position: z.number(), confirm: z.boolean() }).partial().strict(); // prettier-ignore

export function addProp(ownerId: string, dbId: string, p: z.infer<typeof propCreateSchema>): DbProp {
	own(ownerId, dbId);
	if (p.type === 'title') bad('A database has one title property already.');
	if (props(dbId).length >= MAX_PROPS) bad(`A database can have ${MAX_PROPS} properties.`);
	const id = newId('pdp');
	const t = now();
	db().prepare(`INSERT INTO database_properties (id, database_id, name, property_type, config_json, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		.run(id, dbId, p.name, p.type, JSON.stringify(p.config), maxPos(`SELECT max(position) AS m FROM database_properties WHERE database_id = ?`, dbId), t, t); // prettier-ignore
	return { id, name: p.name, type: p.type, config: p.config };
}

/** how many stored values would not fit `type` (D-19 warning) */
function misfits(propId: string, type: PropType, config: PropConfig): number {
	const vs = db().prepare(`SELECT value_json FROM database_values WHERE property_id = ?`).all(propId) as {
		value_json: string;
	}[];
	return vs.filter((v) => !checkValue(type, JSON.parse(v.value_json), config).ok).length;
}

/** rename, reorder, edit options, change type. A type change that leaves values not fitting needs confirm (409 first). */
export function patchProp(ownerId: string, propId: string, p: z.infer<typeof propPatchSchema>): DbProp {
	return txImmediate(() => {
		const cur = propOf(ownerId, propId);
		const type = p.type ?? cur.property_type;
		const config = p.config ?? (JSON.parse(cur.config_json) as PropConfig);
		if (p.type && p.type !== cur.property_type && (cur.property_type === 'title' || p.type === 'title'))
			bad("The title property's type can't change.");
		if ((p.type || p.config) && !p.confirm) {
			const n = misfits(propId, type, config);
			if (n) throw new ApiFail(409, 'values_lost', `${n} value${n === 1 ? '' : 's'} won't fit. They stay as they are, marked ⚠, until you edit them.`); // prettier-ignore
		}
		db().prepare(`UPDATE database_properties SET name = ?, property_type = ?, config_json = ?, position = ?, updated_at = ? WHERE id = ?`)
			.run(p.name ?? cur.name, type, JSON.stringify(config), p.position ?? cur.position, now(), propId); // prettier-ignore
		return { id: propId, name: p.name ?? cur.name, type, config };
	});
}

export function deleteProp(ownerId: string, propId: string, confirm: boolean): void {
	txImmediate(() => {
		const p = propOf(ownerId, propId);
		if (p.property_type === 'title') bad("The title property can't be deleted.");
		const n = (
			db().prepare(`SELECT count(*) AS n FROM database_values WHERE property_id = ?`).get(propId) as {
				n: number;
			}
		).n;
		if (n && !confirm)
			throw new ApiFail(409, 'values_lost', `Deleting "${p.name}" removes ${n} value${n === 1 ? '' : 's'}.`);
		db().prepare(`DELETE FROM database_properties WHERE id = ?`).run(propId);
	});
}

// ---------- records ----------
export function addRecord(ownerId: string, dbId: string, values: Record<string, unknown> = {}): DbRow {
	return txImmediate(() => {
		own(ownerId, dbId);
		const n = (
			db().prepare(`SELECT count(*) AS n FROM database_records WHERE database_id = ?`).get(dbId) as {
				n: number;
			}
		).n;
		if (n >= MAX_RECORDS) bad(`A database can hold ${MAX_RECORDS} records.`);
		const id = newId('pdr');
		const t = now();
		db().prepare(`INSERT INTO database_records (id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
			.run(id, dbId, maxPos(`SELECT max(position) AS m FROM database_records WHERE database_id = ?`, dbId), t, t); // prettier-ignore
		if (Object.keys(values).length) setValues(ownerId, id, values);
		return {
			id,
			pageId: null,
			values: get(ownerId, dbId, { limit: 500 }).rows.find((r) => r.id === id)?.values ?? {},
		};
	});
}

/** set some values; each checked for its property's type (bad = 400 with what + how to fix). Title syncs the record page. */
export function setValues(
	ownerId: string,
	recordId: string,
	values: Record<string, unknown>,
): Record<string, unknown> {
	return txImmediate(() => {
		const r = recordOf(ownerId, recordId);
		const ps = props(r.database_id);
		const t = now();
		const out: Record<string, unknown> = {};
		for (const [pid, raw] of Object.entries(values)) {
			const p = ps.find((x) => x.id === pid);
			if (!p) bad('unknown property');
			const c = checkValue((p as DbProp).type, raw, (p as DbProp).config);
			if (!c.ok) bad(`${(p as DbProp).name}: ${c.error}`, 'bad_value');
			const v = (c as { value: unknown }).value;
			if (v === null) db().prepare(`DELETE FROM database_values WHERE record_id = ? AND property_id = ?`).run(recordId, pid);
			else db().prepare(`INSERT INTO database_values (record_id, property_id, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (record_id, property_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(recordId, pid, JSON.stringify(v), t); // prettier-ignore
			out[pid] = v;
			if ((p as DbProp).type === 'title' && r.page_id) db().prepare(`UPDATE pages SET title = ?, updated_at = ? WHERE id = ?`).run((v as string | null) ?? '', t, r.page_id); // prettier-ignore
		}
		db()
			.prepare(`UPDATE database_records SET updated_at = ?, revision = revision + 1 WHERE id = ?`)
			.run(t, recordId);
		return out;
	});
}

/** the record's page: same identity every time, made on first open (DESIGN §5), under the database's page */
export function recordPage(ownerId: string, recordId: string): string {
	return txImmediate(() => {
		const r = recordOf(ownerId, recordId);
		if (r.page_id) {
			const live = db().prepare(`SELECT 1 FROM pages WHERE id = ? AND deleted_at IS NULL`).get(r.page_id);
			if (live) return r.page_id;
		}
		const d = own(ownerId, r.database_id);
		const title = db().prepare(`SELECT v.value_json FROM database_values v JOIN database_properties p ON p.id = v.property_id WHERE v.record_id = ? AND p.property_type = 'title'`).get(recordId) as { value_json: string } | undefined; // prettier-ignore
		const pg = pages.create(ownerId, {
			parentId: d.page_id,
			title: title ? (JSON.parse(title.value_json) as string) : '',
		});
		db().prepare(`UPDATE database_records SET page_id = ? WHERE id = ?`).run(pg.id, recordId);
		return pg.id;
	});
}

/** delete a record (UI confirms); its page goes to Trash with it (restorable 30 d) */
export function deleteRecord(ownerId: string, recordId: string): void {
	txImmediate(() => {
		const r = recordOf(ownerId, recordId);
		if (r.page_id && db().prepare(`SELECT 1 FROM pages WHERE id = ? AND deleted_at IS NULL`).get(r.page_id))
			pages.trash(ownerId, r.page_id);
		db().prepare(`DELETE FROM database_records WHERE id = ?`).run(recordId);
	});
}

/** record page title edited on the page itself -> the title value follows */
export function syncTitleFromPage(pageId: string, title: string): void {
	const r = db().prepare(`SELECT r.id, r.database_id FROM database_records r WHERE r.page_id = ?`).get(pageId) as { id: string; database_id: string } | undefined; // prettier-ignore
	if (!r) return;
	const tp = db().prepare(`SELECT id FROM database_properties WHERE database_id = ? AND property_type = 'title'`).get(r.database_id) as { id: string } | undefined; // prettier-ignore
	if (!tp) return;
	if (!title.trim()) db().prepare(`DELETE FROM database_values WHERE record_id = ? AND property_id = ?`).run(r.id, tp.id);
	else db().prepare(`INSERT INTO database_values (record_id, property_id, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (record_id, property_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(r.id, tp.id, JSON.stringify(title.trim()), now()); // prettier-ignore
}

/** for a record page: its database + values (record page shows them above the editor) */
export function recordOfPage(
	ownerId: string,
	pageId: string,
): { databaseId: string; recordId: string; dbPageId: string; dbTitle: string } | null {
	const r = db().prepare(`SELECT r.id, r.database_id, d.page_id, d.title FROM database_records r JOIN page_databases d ON d.id = r.database_id WHERE r.page_id = ? AND d.owner_id = ?`).get(pageId, ownerId) as { id: string; database_id: string; page_id: string; title: string } | undefined; // prettier-ignore
	return r ? { databaseId: r.database_id, recordId: r.id, dbPageId: r.page_id, dbTitle: r.title } : null;
}

// ---------- views ----------
const zFilter = z
	.object({ prop: z.string().max(40), op: z.string().max(20), value: z.unknown().optional() })
	.strict();
export const viewConfigSchema = z.object({ sort: z.object({ prop: z.string().max(40), dir: z.enum(['asc', 'desc']) }).strict().nullable().optional(), filters: z.array(zFilter).max(20).optional(), conj: z.enum(['and', 'or']).optional(), hidden: z.array(z.string().max(40)).max(MAX_PROPS).optional(), order: z.array(z.string().max(40)).max(MAX_PROPS).optional() }).strict(); // prettier-ignore
export const viewPatchSchema = z
	.object({ name: z.string().trim().min(1).max(60), config: viewConfigSchema })
	.partial()
	.strict();

/** filters must name a real property + an operator valid for its type (no raw columns or SQL from the client) */
function checkConfig(dbId: string, c: ViewConfig) {
	const ps = props(dbId);
	for (const f of c.filters ?? []) {
		const p = ps.find((x) => x.id === f.prop);
		if (!p || !OPS[p.type].includes(f.op)) bad('That filter does not fit the property type.');
		if (!NO_VALUE_OPS.includes(f.op) && p?.type === 'number' && typeof f.value !== 'number')
			bad('Number filters need a number.');
	}
	if (c.sort && !ps.some((p) => p.id === c.sort?.prop)) bad('unknown sort property');
}

export function addView(ownerId: string, dbId: string, name: string): DbView {
	own(ownerId, dbId);
	const id = newId('pdv');
	db().prepare(`INSERT INTO database_views (id, database_id, name, view_type, config_json, position) VALUES (?, ?, ?, 'table', '{}', ?)`)
		.run(id, dbId, name, maxPos(`SELECT max(position) AS m FROM database_views WHERE database_id = ?`, dbId)); // prettier-ignore
	return { id, name, type: 'table', config: {} };
}
export function patchView(ownerId: string, viewId: string, p: z.infer<typeof viewPatchSchema>): void {
	const v = db().prepare(`SELECT v.* FROM database_views v JOIN page_databases d ON d.id = v.database_id WHERE v.id = ? AND d.owner_id = ?`).get(viewId, ownerId) as { database_id: string; name: string; config_json: string } | undefined; // prettier-ignore
	if (!v) notFound();
	if (p.config) checkConfig((v as { database_id: string }).database_id, p.config);
	db().prepare(`UPDATE database_views SET name = ?, config_json = ? WHERE id = ?`).run(p.name ?? v?.name, p.config ? JSON.stringify(p.config) : v?.config_json, viewId); // prettier-ignore
}
export function deleteView(ownerId: string, viewId: string): void {
	const v = db().prepare(`SELECT v.database_id FROM database_views v JOIN page_databases d ON d.id = v.database_id WHERE v.id = ? AND d.owner_id = ?`).get(viewId, ownerId) as { database_id: string } | undefined; // prettier-ignore
	if (!v) notFound();
	if (views((v as { database_id: string }).database_id).length < 2)
		bad('A database keeps at least one view.');
	db().prepare(`DELETE FROM database_views WHERE id = ?`).run(viewId);
}

export function rename(ownerId: string, id: string, title: string): void {
	own(ownerId, id);
	db()
		.prepare(`UPDATE page_databases SET title = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`)
		.run(title, now(), id);
}
