// POST /api/quickadd. Server re-parses = truth (FR-Q2).
// /calendar (default) -> item. /planner -> item + linked block (same transaction).
import { parseQuickAdd, type QAContext } from '$lib/quickadd';
import * as courses from './repo/courses';
import * as items from './repo/items';
import * as blocks from './repo/blocks';
import { handle } from './db';
import { bad } from './http';
import { localToUtc, nowLocalMinutes, todayLocal } from '$lib/time';

export function quickContext(me: App.SafeUser, now: number = Date.now()): QAContext {
	return {
		today: todayLocal(me.timezone, now),
		nowMinutes: nowLocalMinutes(me.timezone, now),
		courses: courses.active(me.id).map((c) => ({ id: c.id, code: c.code, aliases: c.aliases })),
	};
}

export function quickAdd(me: App.SafeUser, text: string, now: number = Date.now()) {
	const r = parseQuickAdd(text, quickContext(me, now));
	if (!r.ok) bad((r.problems[0] ?? 'Could not add that.').replace(/`/g, ''));
	return handle().sqlite.transaction(() => {
		const row = items.create(
			me.id,
			items.itemCreateSchema.parse({
				title: r.title,
				type: r.type,
				date: r.date,
				time: r.time,
				courseId: r.courseId,
			}),
		);
		let block: ReturnType<typeof blocks.toDTO> | null = null;
		if (r.target === 'planner' && r.startMinutes !== null && r.endMinutes !== null) {
			const b = blocks.create(
				me.id,
				blocks.blockCreateSchema.parse({
					itemId: row.id,
					startAt: localToUtc(r.date, r.startMinutes, me.timezone),
					endAt: localToUtc(r.date, r.endMinutes, me.timezone),
				}),
			);
			block = blocks.toDTO(b, row.type);
		}
		return {
			item: items.withCounts([row])[0],
			block,
			target: r.target,
			notes: r.notes,
			warnings: r.warnings,
		};
	})();
}
