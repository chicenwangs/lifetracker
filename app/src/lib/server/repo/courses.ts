import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { courses } from '../schema';
import { newId } from '../crypto';
import { bad, notFound } from '../http';
import type { CourseDTO } from '$lib/types';

const toDTO = (c: typeof courses.$inferSelect): CourseDTO => ({
	id: c.id,
	code: c.code,
	name: c.name,
	aliases: c.aliases,
	active: c.active,
});

const normAliases = (a: string[]) => [
	...new Set(
		a.map((x) => x.trim().toLowerCase().replace(/^#/, '')).filter((x) => /^[a-z0-9_-]{1,20}$/.test(x)),
	),
];

export function list(meId: string): CourseDTO[] {
	return db()
		.select()
		.from(courses)
		.where(eq(courses.ownerId, meId))
		.orderBy(asc(courses.code))
		.all()
		.map(toDTO);
}

export function active(meId: string): CourseDTO[] {
	return list(meId).filter((c) => c.active);
}

export const courseSchema = z
	.object({
		code: z.string().trim().min(1).max(20),
		name: z.string().trim().min(1).max(100),
		aliases: z.array(z.string()).max(10).default([]),
		active: z.boolean().default(true),
	})
	.strict();

function aliasClash(meId: string, aliases: string[], selfId?: string) {
	for (const c of list(meId)) {
		if (c.id === selfId) continue;
		const hit = c.aliases.find((a) => aliases.includes(a));
		if (hit) bad(`alias #${hit} already used by ${c.code}`);
	}
}

export function create(meId: string, input: z.infer<typeof courseSchema>): CourseDTO {
	const aliases = normAliases(input.aliases.length ? input.aliases : [input.code]);
	aliasClash(meId, aliases);
	if (list(meId).some((c) => c.code.toLowerCase() === input.code.toLowerCase())) bad('course code exists');
	const id = newId('crs');
	db()
		.insert(courses)
		.values({ id, ownerId: meId, code: input.code, name: input.name, aliases, active: input.active })
		.run();
	const row = db().select().from(courses).where(eq(courses.id, id)).get();
	return row ? toDTO(row) : notFound();
}

export function update(meId: string, id: string, input: Partial<z.infer<typeof courseSchema>>): CourseDTO {
	const own = and(eq(courses.id, id), eq(courses.ownerId, meId));
	if (!db().select().from(courses).where(own).get()) notFound();
	const set = { ...input, ...(input.aliases ? { aliases: normAliases(input.aliases) } : {}) };
	if (set.aliases) aliasClash(meId, set.aliases, id);
	db().update(courses).set(set).where(own).run();
	const row = db().select().from(courses).where(own).get();
	return row ? toDTO(row) : notFound();
}

export function remove(meId: string, id: string): void {
	const r = db()
		.delete(courses)
		.where(and(eq(courses.id, id), eq(courses.ownerId, meId)))
		.run();
	if (!r.changes) notFound();
}
