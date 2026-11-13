// D-22: one-time import of v1 dormant data (lists, people + facts, ideas, places, goals, workouts) into Keep notes
// labelled "From v1". The old tables are only read, never changed (DESIGN §1: keep dormant tables). Once per user.
import { handle, txImmediate } from './db';
import { bad } from './http';
import * as keep from './repo/keep';
import { nowUtcIso } from '$lib/time';

const db = () => handle().sqlite;
const flag = (ownerId: string) => `dormant_import:${ownerId}`;
const all = <T>(sql: string, ...a: unknown[]) =>
	db()
		.prepare(sql)
		.all(...a) as T[];
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // weekday CHECK 1..7
const MAX_BODY = 20_000;
const MAX_ITEMS = 500;

/** rows waiting per kind (0 everywhere = nothing to offer); null = already imported */
export function pending(ownerId: string): Record<string, number> | null {
	if (db().prepare(`SELECT 1 FROM app_meta WHERE key = ?`).get(flag(ownerId))) return null;
	const n = (sql: string) => (db().prepare(sql).get(ownerId) as { n: number }).n;
	return {
		lists: n(`SELECT count(*) AS n FROM lists WHERE owner_id = ?`),
		people: n(`SELECT count(*) AS n FROM people WHERE owner_id = ?`),
		ideas: n(`SELECT count(*) AS n FROM ideas WHERE owner_id = ?`),
		places: n(`SELECT count(*) AS n FROM places WHERE owner_id = ? AND deleted_at IS NULL`),
		goals: n(`SELECT count(*) AS n FROM goals WHERE owner_id = ?`),
		workouts: n(`SELECT count(*) AS n FROM (SELECT owner_id FROM workout_split UNION ALL SELECT owner_id FROM workout_logs) WHERE owner_id = ?`), // prettier-ignore
	};
}

type Note = { title: string; body?: string; items?: { text: string; checked: boolean }[] };
/** split long bodies / lists so each note fits the Keep limits; "(2)", "(3)" on the extra parts */
function split(n: Note): Note[] {
	const parts: Note[] = [];
	if (n.items) {
		for (let i = 0; i < n.items.length || i === 0; i += MAX_ITEMS)
			parts.push({ title: n.title, items: n.items.slice(i, i + MAX_ITEMS) });
	} else {
		let cur = '';
		for (const line of (n.body ?? '').split('\n')) {
			if (cur && cur.length + line.length + 1 > MAX_BODY) {
				parts.push({ title: n.title, body: cur });
				cur = '';
			}
			cur += (cur ? '\n' : '') + line.slice(0, MAX_BODY);
		}
		parts.push({ title: n.title, body: cur });
	}
	return parts.map((p, i) => ({ ...p, title: (i ? `${p.title} (${i + 1})` : p.title).slice(0, 300) }));
}

function collect(ownerId: string): Note[] {
	const out: Note[] = [];
	const it = (text: string, checked: boolean) => ({ text: text.slice(0, 1000), checked });
	for (const l of all<{ id: string; name: string }>(
		`SELECT id, name FROM lists WHERE owner_id = ? ORDER BY sort`,
		ownerId,
	)) {
		const rows = all<{ text: string; done: number; note: string | null; link: string | null }>(`SELECT text, done, note, link FROM list_items WHERE list_id = ? ORDER BY sort`, l.id); // prettier-ignore
		out.push({
			title: l.name,
			items: rows.map((r) => it([r.text, r.note, r.link].filter(Boolean).join(' — '), !!r.done)),
		});
	}
	for (const p of all<{ id: string; name: string; aliases: string }>(
		`SELECT id, name, aliases FROM people WHERE owner_id = ? ORDER BY name`,
		ownerId,
	)) {
		const aka = (JSON.parse(p.aliases) as string[]).filter(Boolean);
		const facts = all<{ category: string; text: string; detail: string | null }>(`SELECT category, text, detail FROM person_facts WHERE person_id = ? ORDER BY category, sort`, p.id); // prettier-ignore
		const lines = [...(aka.length ? [`Also: ${aka.join(', ')}`] : []), ...facts.map((f) => `${f.category.replace('_', ' ')}: ${f.text}${f.detail ? ` — ${f.detail}` : ''}`)]; // prettier-ignore
		out.push({ title: p.name, body: lines.join('\n') });
	}
	const ideas = all<{ channel: string; stage: string; text: string }>(`SELECT channel, stage, text FROM ideas WHERE owner_id = ? ORDER BY channel, sort`, ownerId); // prettier-ignore
	for (const ch of [...new Set(ideas.map((i) => i.channel))])
		out.push({ title: `Ideas · ${ch}`, items: ideas.filter((i) => i.channel === ch).map((i) => it(`${i.text} (${i.stage})`, i.stage === 'posted')) }); // prettier-ignore
	const places = all<{ name: string; city: string; areas: string; cuisines: string; halal: number; visited: number; rating: number | null; notes: string | null }>(`SELECT name, city, areas, cuisines, halal, visited, rating, notes FROM places WHERE owner_id = ? AND deleted_at IS NULL ORDER BY city, name`, ownerId); // prettier-ignore
	for (const city of [...new Set(places.map((p) => p.city))])
		out.push({
			title: `Places · ${city}`,
			items: places.filter((p) => p.city === city).map((p) => it([p.name, ...(JSON.parse(p.areas) as string[]), ...(JSON.parse(p.cuisines) as string[]), p.halal ? 'halal' : '', p.rating ? `${p.rating}★` : '', p.notes ?? ''].filter(Boolean).join(' · '), !!p.visited)), // prettier-ignore
		});
	const goals = all<{ period: string; text: string; done: number }>(`SELECT period, text, done FROM goals WHERE owner_id = ? ORDER BY period, sort`, ownerId); // prettier-ignore
	for (const per of [...new Set(goals.map((g) => g.period))])
		out.push({ title: `Goals · ${per}`, items: goals.filter((g) => g.period === per).map((g) => it(g.text, !!g.done)) }); // prettier-ignore
	const kg = (v: number | null) => (v == null ? '' : ` ${v} kg`);
	const split_ = all<{ weekday: number; exercise: string; current_kg: number | null; current_effort: string | null }>(`SELECT weekday, exercise, current_kg, current_effort FROM workout_split WHERE owner_id = ? ORDER BY weekday, sort`, ownerId); // prettier-ignore
	if (split_.length) out.push({ title: 'Workout split', body: split_.map((s) => `${DAYS[s.weekday] ?? s.weekday}: ${s.exercise}${kg(s.current_kg)}${s.current_effort ? ` (${s.current_effort})` : ''}`).join('\n') }); // prettier-ignore
	const logs = all<{ date: string; exercise: string; weight_kg: number | null; effort: string | null; sets: number | null; reps: number | null; note: string | null }>(`SELECT date, exercise, weight_kg, effort, sets, reps, note FROM workout_logs WHERE owner_id = ? ORDER BY date, created_at`, ownerId); // prettier-ignore
	if (logs.length) out.push({ title: 'Workout log', body: logs.map((l) => `${l.date} ${l.exercise}${kg(l.weight_kg)}${l.sets ? ` ${l.sets}×${l.reps ?? '?'}` : ''}${l.effort ? ` (${l.effort})` : ''}${l.note ? ` — ${l.note}` : ''}`).join('\n') }); // prettier-ignore
	return out.flatMap(split);
}

/** make the notes, all or nothing; afterwards the button is gone for good */
export function importDormant(ownerId: string): { notes: number } {
	return txImmediate(() => {
		if (!pending(ownerId)) bad('Your v1 data was already brought in.', 'done');
		const notes = collect(ownerId).filter((n) => n.title.trim() || n.body?.trim() || n.items?.length);
		if (notes.length) {
			const label =
				keep.labels(ownerId).find((l) => l.name.toLowerCase() === 'from v1')?.id ??
				keep.createLabel(ownerId, 'From v1').id;
			for (const n of notes)
				keep.create(ownerId, {
					type: n.items ? 'checklist' : 'text',
					title: n.title || 'Untitled',
					body: n.body ?? '',
					items: n.items?.map((i) => ({ ...i, parentId: null })),
					labels: [label],
				});
		}
		db().prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?)`).run(flag(ownerId), nowUtcIso());
		return { notes: notes.length };
	});
}
