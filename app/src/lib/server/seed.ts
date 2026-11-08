// Seed import (FR-IM1..3, TECHNICAL §10). Reads data/seed/*.json from scripts/transform_notion.py.
// courses.json / goals.json are no longer read (features removed); items' course_id is dropped.
// Idempotent: items/blocks update only rows NOT edited in app since (db.updated_at <= seed.updated_at);
// other tables insert-if-missing (no updated_at to compare -> never overwrite app edits).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { handle } from './db';
import * as usersRepo from './repo/users';
import * as calendarsRepo from './repo/calendars';
import { rebuildFts } from './search';
import { nowUtcIso } from '$lib/time';

const SEED_OWNER = 'usr_jeremy';
const SEED_CAL = 'cal_jeremy_main';

const id = (p: string) => z.string().regex(new RegExp(`^${p}_[0-9a-z]+$`));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoZ = z.string().regex(/Z$/);
const types = z.enum(['Work', 'Exam', 'Event', 'Hobby', 'Dating']).nullable();
const status = z.enum(['todo', 'doing', 'done']);
const effort = z.enum(['light', 'moderate', 'heavy']).nullable();

const S = {
	items: z.object({
		id: id('itm'),
		calendar_id: z.string(),
		title: z.string().min(1).max(300),
		type: types,
		status,
		date: date.nullable(),
		time: z
			.string()
			.regex(/^\d{2}:\d{2}$/)
			.nullable(),
		end_date: date.nullable(),
		course_id: z.string().nullable().optional(), // courses were removed (2026-11-08): ignored
		parent_id: z.string().nullable(),
		notes: z.string().nullable(),
		private: z.boolean(),
		created_at: isoZ.optional(),
		updated_at: isoZ.optional(),
		started_at: isoZ.nullable(),
		completed_at: isoZ.nullable(),
		source: z.literal('notion').nullable(),
	}),
	blocks: z.object({
		id: id('blk'),
		calendar_id: z.string(),
		item_id: z.string().nullable(),
		label: z.string().min(1),
		type: types,
		start_at: isoZ,
		end_at: isoZ,
		status,
		created_at: isoZ.optional(),
		updated_at: isoZ.optional(),
	}),
	workout_split: z.object({
		id: id('wsp'),
		owner_id: z.string(),
		weekday: z.number().int().min(1).max(7),
		exercise: z.string(),
		sort: z.number().int(),
		current_kg: z.number().nullable(),
		current_effort: effort,
		legacy_weeks: z.record(z.string(), z.unknown()).nullable(),
	}),
	places: z.object({
		id: id('plc'),
		owner_id: z.string(),
		name: z.string(),
		city: z.string(),
		areas: z.array(z.string()),
		cuisines: z.array(z.string()),
		open_when: z.array(z.string()),
		closed_on: z.array(z.string()),
		halal: z.boolean(),
		visited: z.boolean(),
		approved: z.boolean(),
		rating: z.number().int().min(1).max(5).nullable(),
		notes: z.string().nullable(),
		last_visited: date.nullable(),
	}),
	lists: z.object({ id: id('lst'), owner_id: z.string(), name: z.string(), sort: z.number().int() }),
	list_items: z.object({
		id: id('lit'),
		list_id: z.string(),
		text: z.string(),
		done: z.boolean(),
		note: z.string().nullable(),
		link: z.string().nullable(),
		created_at: isoZ.optional(),
		sort: z.number().int(),
	}),
	people: z.object({ id: id('per'), owner_id: z.string(), name: z.string(), aliases: z.array(z.string()) }),
	person_facts: z.object({
		id: id('fct'),
		person_id: z.string(),
		category: z.enum(['likes', 'info', 'hates', 'wants', 'bucket_list', 'misc']),
		text: z.string(),
		detail: z.string().nullable(),
		sort: z.number().int(),
	}),
	ideas: z.object({
		id: id('ida'),
		owner_id: z.string(),
		channel: z.string(),
		stage: z.enum(['idea', 'filmed', 'edited', 'posted']),
		text: z.string(),
		created_at: isoZ.optional(),
		sort: z.number().int(),
	}),
} as const;

type Table = keyof typeof S;
/** FK order */
export const ORDER: Table[] = [
	'items',
	'blocks',
	'workout_split',
	'places',
	'lists',
	'list_items',
	'people',
	'person_facts',
	'ideas',
];
/** tables whose rows may be refreshed from seed when not edited in app */
const UPDATABLE: Partial<Record<Table, true>> = { items: true, blocks: true };

const reportSchema = z
	.object({
		counts: z.record(z.string(), z.number()),
		warnings: z.array(z.string()).default([]),
	})
	.passthrough();
export type SeedReport = z.infer<typeof reportSchema>;

export function readReport(dir: string): SeedReport | null {
	const p = join(dir, '_report.json');
	if (!existsSync(p)) return null;
	return reportSchema.parse(JSON.parse(readFileSync(p, 'utf-8')));
}

type Row = Record<string, unknown>;

function load(dir: string, t: Table): Row[] {
	const p = join(dir, `${t}.json`);
	if (!existsSync(p)) throw new Error(`seed file missing: ${t}.json`);
	const raw: unknown = JSON.parse(readFileSync(p, 'utf-8'));
	if (!Array.isArray(raw)) throw new Error(`${t}.json: must be an array`);
	return raw.map((r, i) => {
		const res = S[t].safeParse(r);
		if (!res.success) {
			const iss = res.error.issues[0];
			throw new Error(`${t}.json[${i}]: ${iss?.path.join('.')}: ${iss?.message}`);
		}
		return res.data as Row;
	});
}

function toSql(v: unknown): unknown {
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (v !== null && typeof v === 'object') return JSON.stringify(v);
	return v ?? null;
}

export interface ImportResult {
	counts: Record<string, number>;
	inserted: Record<string, number>;
	updated: Record<string, number>;
	warnings: string[];
}

export function importSeed(dir: string, ownerUsername: string): ImportResult {
	const owner = usersRepo.byUsername(ownerUsername);
	if (!owner) throw new Error(`owner user not found: ${ownerUsername}`);
	const cal = calendarsRepo.defaultFor(owner.id);
	const report = readReport(dir);
	if (!report) throw new Error(`no _report.json in ${dir} (run scripts/transform_notion.py)`);

	const data = {} as Record<Table, Row[]>;
	for (const t of ORDER) data[t] = load(dir, t);

	const now = nowUtcIso();
	const remap = (r: Row): Row => {
		const o: Row = {};
		for (const [k, v] of Object.entries(r)) o[k] = v === SEED_OWNER ? owner.id : v === SEED_CAL ? cal.id : v;
		if (o.calendar_id !== undefined && o.calendar_id !== cal.id)
			throw new Error(`row ${String(r.id)}: unknown calendar`);
		if (o.owner_id !== undefined && o.owner_id !== owner.id)
			throw new Error(`row ${String(r.id)}: unknown owner`);
		return o;
	};
	for (const t of ORDER) data[t] = data[t].map(remap);
	for (const r of data.items) {
		delete r.course_id;
		r.created_at ??= now;
		r.updated_at ??= r.created_at;
		r.created_by ??= owner.id;
		r.updated_by ??= owner.id;
	}
	for (const r of data.blocks) {
		r.created_at ??= now;
		r.updated_at ??= r.created_at;
		r.updated_by ??= owner.id;
	}
	for (const t of ['list_items', 'ideas'] as const) for (const r of data[t]) r.created_at ??= now;

	const inserted: Record<string, number> = {};
	const updated: Record<string, number> = {};
	const counts: Record<string, number> = {};
	const sqlite = handle().sqlite;

	// never move rows between accounts: a seed already imported into someone else stays theirs
	for (const t of ['items', 'blocks'] as const) {
		const other = sqlite.prepare(`SELECT 1 FROM ${t} WHERE id = ? AND calendar_id <> ?`);
		for (const r of data[t])
			if (other.get(r.id, cal.id))
				throw new Error(`This seed was already imported into another account (${t} ${String(r.id)}).`);
	}

	sqlite.transaction(() => {
		for (const t of ORDER) {
			inserted[t] = 0;
			updated[t] = 0;
			const rows = data[t];
			if (!rows.length) {
				counts[t] = 0;
				continue;
			}
			const cols = Object.keys(rows[0] ?? {});
			for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
			const exists = sqlite.prepare(`SELECT 1 FROM ${t} WHERE id = ?`);
			const ins = sqlite.prepare(
				`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`,
			);
			const upd = UPDATABLE[t]
				? sqlite.prepare(
						`UPDATE ${t} SET ${cols
							.filter((c) => !['id', 'created_at', 'created_by', 'started_at', 'completed_at'].includes(c))
							.map((c) => `${c} = @${c}`)
							.join(', ')} WHERE id = @id AND updated_at <= @updated_at AND deleted_at IS NULL`,
					)
				: null;
			for (const r of rows) {
				const vals = cols.map((c) => toSql(r[c]));
				if (exists.get(r.id)) {
					if (upd) {
						const named = Object.fromEntries(cols.map((c) => [c, toSql(r[c])]));
						updated[t] += upd.run(named).changes;
					}
				} else {
					inserted[t] += ins.run(...vals).changes;
				}
			}
			// every seed id must now exist (+ belong to owner for owned tables)
			const ids = rows.map((r) => r.id as string);
			let present = 0;
			for (const i of ids) if (exists.get(i)) present++;
			counts[t] = present;
			const want = report.counts[t];
			if (want !== undefined && want !== rows.length)
				throw new Error(
					`${t}: seed has ${rows.length} rows but _report.json says ${want} (re-run transform)`,
				);
			if (present !== rows.length)
				throw new Error(`${t}: only ${present}/${rows.length} rows present after import`);
		}
		rebuildFts(owner.id);
	})();

	return { counts, inserted, updated, warnings: report.warnings };
}
