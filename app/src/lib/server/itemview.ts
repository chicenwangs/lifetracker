// Item view payload (centre peek + /item/[id] page). Own items only (P2 adds partner read-only card).
import * as items from './repo/items';
import * as blocks from './repo/blocks';
import * as courses from './repo/courses';
import { todayLocal } from '$lib/time';
import type { ItemDTO } from '$lib/types';

export function itemView(me: App.SafeUser, id: string) {
	const it = items.mustOwn(me.id, id); // 404 if not mine
	const parent = it.parentId ? items.getOwn(me.id, it.parentId) : undefined;
	return {
		item: { ...(items.withCounts([it])[0] as ItemDTO), notes: it.notes },
		parent: parent ? { id: parent.id, title: parent.title } : null,
		steps: items.withCounts(items.steps(me.id, it.id)),
		blocks: blocks.forItem(me.id, it.id).map((b) => blocks.toDTO(b, it.type)),
		courses: courses.list(me.id).map((c) => ({ id: c.id, code: c.code, name: c.name })),
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
