// Item view payload (centre peek + /item/[id] page). Own items only (P2 adds partner read-only card).
import * as items from './repo/items';
import * as blocks from './repo/blocks';
import { splitOccId } from '$lib/rrule';
import { notFound } from './http';
import { addDays, diffDays, todayLocal } from '$lib/time';
import type { ItemDTO } from '$lib/types';

export function itemView(me: App.SafeUser, rawId: string) {
	const { id, occDate } = splitOccId(rawId);
	const it = items.mustOwn(me.id, id); // 404 if not mine
	const parent = it.parentId ? items.getOwn(me.id, it.parentId) : undefined;
	const dto = { ...(items.withCounts([it])[0] as ItemDTO), notes: it.notes };
	// #296: only dates the rule really generates are occurrences; any other @date is a 404
	if (occDate && it.rrule && it.date) {
		if (!items.isOccurrence(it, occDate)) notFound();
		const span = it.endDate ? diffDays(it.date, it.endDate) : 0;
		dto.id = `${it.id}@${occDate}`;
		dto.seriesId = it.id;
		dto.date = occDate;
		dto.endDate = span > 0 ? addDays(occDate, span) : null;
		dto.occurrenceDate = occDate;
		dto.seriesDate = it.date;
	}
	return {
		item: dto,
		parent: parent ? { id: parent.id, title: parent.title } : null,
		steps: items.withCounts(items.steps(me.id, it.id)),
		blocks: blocks.forItem(me.id, it.id).map((b) => blocks.toDTO(b, it.type)),
		history: {
			createdAt: it.createdAt,
			startedAt: it.startedAt,
			completedAt: it.completedAt,
			updatedAt: it.updatedAt,
			updatedBy: items.editorName(it.updatedBy),
			source: it.source,
		},
		today: todayLocal(me.timezone),
		tz: me.timezone,
	};
}
export type ItemView = ReturnType<typeof itemView>;
