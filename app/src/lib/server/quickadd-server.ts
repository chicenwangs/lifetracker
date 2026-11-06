// POST /api/quickadd. Server re-parses = truth (FR-Q2).
import { parseQuickAdd, type QAContext } from '$lib/quickadd';
import * as courses from './repo/courses';
import * as items from './repo/items';
import { bad } from './http';
import { nowLocalMinutes, todayLocal } from '$lib/time';

export function quickContext(me: App.SafeUser, now: number = Date.now()): QAContext {
	return {
		today: todayLocal(me.timezone, now),
		nowMinutes: nowLocalMinutes(me.timezone, now),
		courses: courses.active(me.id).map((c) => ({ id: c.id, code: c.code, aliases: c.aliases })),
	};
}

export function quickAdd(me: App.SafeUser, text: string) {
	const r = parseQuickAdd(text, quickContext(me));
	if (!r.ok) return bad(r.reason);
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
	return { item: items.withCounts([row])[0], warnings: r.warnings };
}
