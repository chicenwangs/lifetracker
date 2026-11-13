// Item types per owner (FEATURES §3b, DESIGN §5). Keys are what items.type / blocks.type / share kinds store.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, txImmediate } from '../db';
import { blocks, calendars, itemTypes, items } from '../schema';
import { newId } from '../crypto';
import { bad, notFound } from '../http';
import { BUILTIN_TYPES, inkFor, MAX_TYPES, RESERVED_SLUGS, slugify } from '$lib/itemtypes';
import type { ItemTypeDTO } from '$lib/types';
import { nowUtcIso } from '$lib/time';

type Row = typeof itemTypes.$inferSelect;
const toDTO = (r: Row): ItemTypeDTO => ({
	id: r.id,
	key: r.key,
	name: r.name,
	bg: r.bg,
	ink: r.ink,
	slug: r.slug,
	position: r.position,
	builtin: r.builtin,
	shareDefault: r.shareDefault,
	countsDown: r.countsDown,
	isDefault: r.isDefault,
});

export function list(ownerId: string): ItemTypeDTO[] {
	return db()
		.select()
		.from(itemTypes)
		.where(eq(itemTypes.ownerId, ownerId))
		.orderBy(asc(itemTypes.position))
		.all()
		.map(toDTO);
}

/** list + how many live items/blocks use each (Settings › Item types) */
export function listWithUse(ownerId: string): ItemTypeDTO[] {
	const cals = db().select({ id: calendars.id }).from(calendars).where(eq(calendars.ownerId, ownerId)).all();
	const ids = cals.map((c) => c.id);
	const use = new Map<string, number>();
	for (const t of [items, blocks]) {
		if (!ids.length) break;
		for (const r of db()
			.select({ k: t.type, n: sql<number>`count(*)` })
			.from(t)
			.where(and(inArray(t.calendarId, ids), isNull(t.deletedAt)))
			.groupBy(t.type)
			.all())
			if (r.k) use.set(r.k, (use.get(r.k) ?? 0) + r.n);
	}
	return list(ownerId).map((t) => ({ ...t, used: use.get(t.key) ?? 0 }));
}

/** new account: the 5 built-ins. Call inside the account-creation transaction. */
export function seedFor(ownerId: string): void {
	const now = nowUtcIso();
	db()
		.insert(itemTypes)
		.values(BUILTIN_TYPES.map((t, i) => ({ ...t, id: newId('ity'), ownerId, position: i, builtin: true, createdAt: now, updatedAt: now })))
		.run(); // prettier-ignore
}

/** throws 400 unless `key` is one of the owner's types (NULL = No type is always fine) */
export function mustHave(ownerId: string, key: string | null | undefined): void {
	if (key == null) return;
	const hit = db()
		.select({ id: itemTypes.id })
		.from(itemTypes)
		.where(and(eq(itemTypes.ownerId, ownerId), eq(itemTypes.key, key)))
		.get();
	if (!hit) bad('unknown type', 'bad_type');
}

const zName = z.string().trim().min(1, 'Name needed').max(30);
const zColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'bad colour');
const zSlug = z.string().trim().toLowerCase().regex(/^[a-z0-9]{1,20}$/, 'Quick-add word: 1-20 letters or digits');

export const createSchema = z
	.object({
		name: zName,
		bg: zColor,
		slug: zSlug.optional(),
		countsDown: z.boolean().default(false),
		shareDefault: z.boolean().default(false),
	})
	.strict();
export const patchSchema = z
	.object({ name: zName, bg: zColor, slug: zSlug, countsDown: z.boolean(), shareDefault: z.boolean(), isDefault: z.literal(true) })
	.partial()
	.strict(); // prettier-ignore

function checkSlug(ownerId: string, slug: string, selfId?: string) {
	if (!slug) bad('Pick a quick-add word (letters or digits).', 'bad_slug');
	if (RESERVED_SLUGS.includes(slug)) bad(`/${slug} is already a quick-add option. Pick another word.`, 'bad_slug');
	const clash = list(ownerId).find((t) => t.slug === slug && t.id !== selfId);
	if (clash) bad(`/${slug} is used by ${clash.name}.`, 'bad_slug');
}

const own = (ownerId: string, id: string): Row =>
	db()
		.select()
		.from(itemTypes)
		.where(and(eq(itemTypes.id, id), eq(itemTypes.ownerId, ownerId)))
		.get() ?? notFound();

export function create(ownerId: string, input: z.infer<typeof createSchema>): ItemTypeDTO {
	return txImmediate(() => {
		const all = list(ownerId);
		if (all.length >= MAX_TYPES) bad(`You have ${MAX_TYPES} types. Delete one first.`, 'type_cap');
		const slug = input.slug ?? slugify(input.name);
		checkSlug(ownerId, slug);
		const id = newId('ity');
		const now = nowUtcIso();
		db()
			.insert(itemTypes)
			.values({
				id,
				ownerId,
				key: id, // custom key = its id: never collides with a built-in, survives renames
				name: input.name,
				bg: input.bg.toUpperCase(),
				ink: inkFor(input.bg),
				slug,
				position: Math.max(-1, ...all.map((t) => t.position)) + 1,
				countsDown: input.countsDown,
				shareDefault: input.shareDefault,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		return toDTO(own(ownerId, id));
	});
}

export function patch(ownerId: string, id: string, p: z.infer<typeof patchSchema>): ItemTypeDTO {
	return txImmediate(() => {
		own(ownerId, id);
		if (p.slug !== undefined) checkSlug(ownerId, p.slug, id);
		if (p.isDefault) db().update(itemTypes).set({ isDefault: false }).where(eq(itemTypes.ownerId, ownerId)).run();
		db()
			.update(itemTypes)
			.set({ ...p, ...(p.bg ? { bg: p.bg.toUpperCase(), ink: inkFor(p.bg) } : {}), updatedAt: nowUtcIso() })
			.where(eq(itemTypes.id, id))
			.run();
		return toDTO(own(ownerId, id));
	});
}

/** delete a custom type; its items + blocks move to `moveTo` (a key of mine, or null = No type) */
export function remove(ownerId: string, id: string, moveTo: string | null): { moved: number; row: Row } {
	return txImmediate(() => {
		const t = own(ownerId, id);
		if (t.builtin) bad('Built-in types can be renamed or recoloured, not deleted.', 'builtin');
		if (t.isDefault) bad('This is your default type. Star another type first.', 'is_default');
		if (moveTo === t.key) bad('Pick another type to move them to.');
		mustHave(ownerId, moveTo);
		const cals = db().select({ id: calendars.id }).from(calendars).where(eq(calendars.ownerId, ownerId)).all();
		let moved = 0;
		for (const tbl of [items, blocks])
			moved += db()
				.update(tbl)
				.set({ type: moveTo })
				.where(and(eq(tbl.type, t.key), inArray(tbl.calendarId, cals.map((c) => c.id))))
				.run().changes; // prettier-ignore
		db().delete(itemTypes).where(eq(itemTypes.id, id)).run();
		return { moved, row: t };
	});
}

/** full order, every id of mine exactly once */
export function reorder(ownerId: string, ids: string[]): void {
	txImmediate(() => {
		const mine = list(ownerId).map((t) => t.id);
		if (ids.length !== mine.length || new Set(ids).size !== ids.length || ids.some((i) => !mine.includes(i)))
			bad('send every type id once');
		ids.forEach((id, i) => db().update(itemTypes).set({ position: i }).where(eq(itemTypes.id, id)).run());
	});
}
