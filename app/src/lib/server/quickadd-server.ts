// POST /api/quickadd. Server re-parses = truth (FR-Q2).
// default (planner) -> block only · /calendar -> item only · /both -> item + linked block (one transaction).
import { parseQuickAdd, type QAContext, type QASlot } from '$lib/quickadd';
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

export function quickAdd(me: App.SafeUser, text: string, now: number = Date.now(), slot?: QASlot) {
	const r = parseQuickAdd(text, { ...quickContext(me, now), slot });
	if (!r.ok) bad((r.problems[0] ?? 'Could not add that.').replace(/`/g, ''));
	// timeline drag with no /type or #course = no type (grey); the N palette keeps its Event default
	const type = slot && !r.typeSet && !r.courseId ? null : r.type;
	return handle().sqlite.transaction(() => {
		let item: ReturnType<typeof items.withCounts>[number] | null = null;
		let block: ReturnType<typeof blocks.toDTO> | null = null;
		if (r.target !== 'planner') {
			const row = items.create(
				me.id,
				items.itemCreateSchema.parse({
					title: r.title,
					type,
					date: r.date,
					time: r.time,
					courseId: r.courseId,
				}),
			);
			item = items.withCounts([row])[0] ?? null;
		}
		if (r.target !== 'calendar' && r.startMinutes !== null && r.endMinutes !== null) {
			const b = blocks.create(
				me.id,
				blocks.blockCreateSchema.parse({
					label: item ? undefined : r.title.slice(0, 200),
					type: item ? null : type,
					itemId: item?.id ?? null,
					startAt: localToUtc(r.date, r.startMinutes, me.timezone),
					endAt: localToUtc(r.date, r.endMinutes, me.timezone),
				}),
			);
			block = blocks.toDTO(b, item?.type ?? null);
		}
		return { item, block, target: r.target, notes: r.notes, warnings: r.warnings };
	})();
}
