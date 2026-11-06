import { and, asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { db, handle } from '../db';
import { goals } from '../schema';
import { newId } from '../crypto';
import { notFound } from '../http';
import type { GoalDTO } from '$lib/types';

const toDTO = (g: typeof goals.$inferSelect): GoalDTO => ({
	id: g.id,
	period: g.period,
	text: g.text,
	done: g.done,
	sort: g.sort,
});
export const zPeriod = z.string().regex(/^\d{4}-Q[1-4]$/, 'period like 2026-Q4');

export function forPeriod(meId: string, period: string): GoalDTO[] {
	return db()
		.select()
		.from(goals)
		.where(and(eq(goals.ownerId, meId), eq(goals.period, period)))
		.orderBy(asc(goals.sort))
		.all()
		.map(toDTO);
}

export const goalCreateSchema = z
	.object({ period: zPeriod, text: z.string().trim().min(1).max(300) })
	.strict();

export function create(meId: string, input: z.infer<typeof goalCreateSchema>): GoalDTO {
	const top =
		db()
			.select({ m: max(goals.sort) })
			.from(goals)
			.where(and(eq(goals.ownerId, meId), eq(goals.period, input.period)))
			.get()?.m ?? -1;
	const id = newId('gol');
	db()
		.insert(goals)
		.values({ id, ownerId: meId, period: input.period, text: input.text, done: false, sort: top + 1 })
		.run();
	return get(meId, id);
}

function get(meId: string, id: string): GoalDTO {
	const g = db()
		.select()
		.from(goals)
		.where(and(eq(goals.id, id), eq(goals.ownerId, meId)))
		.get();
	return g ? toDTO(g) : notFound();
}

export const goalPatchSchema = z
	.object({ text: z.string().trim().min(1).max(300), done: z.boolean() })
	.partial()
	.strict();

export function update(meId: string, id: string, p: z.infer<typeof goalPatchSchema>): GoalDTO {
	get(meId, id);
	db()
		.update(goals)
		.set(p)
		.where(and(eq(goals.id, id), eq(goals.ownerId, meId)))
		.run();
	return get(meId, id);
}

export function remove(meId: string, id: string): void {
	get(meId, id);
	db()
		.delete(goals)
		.where(and(eq(goals.id, id), eq(goals.ownerId, meId)))
		.run();
}

/** ids in new order; all must be own */
export function reorder(meId: string, ids: string[]): void {
	handle().sqlite.transaction(() => {
		ids.forEach((id, i) => {
			const r = db()
				.update(goals)
				.set({ sort: i })
				.where(and(eq(goals.id, id), eq(goals.ownerId, meId)))
				.run();
			if (!r.changes) notFound();
		});
	})();
}
