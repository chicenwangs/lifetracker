// MOST IMPORTANT FILE (TECHNICAL §7). Server-only filtering: the client never receives hidden data.
// Rev 2026-11-08: grants are view-only. A grant lists visible kinds (Work, Exam, Event, Hobby, Dating, None,
// Blocks) and what happens to the rest: 'busy' (times only, titled "Busy") or 'none' (left out).
// Never sent to a grantee: notes, steps, parent, private flag, hidden titles/types, real ids of busy rows.
import { hmac } from './crypto';
import type { ItemRow } from './repo/items';
import type { BlockDTO, ItemDTO, ItemType, PartnerTag, ShareKind } from '$lib/types';

export interface Access {
	visible: Set<ShareKind>;
	hiddenAs: 'busy' | 'none';
	owner: PartnerTag;
}

/** stable per viewer, unlinkable to the real id */
export function busyId(id: string, viewerId: string): string {
	return 'busy_' + hmac(`${id}:${viewerId}`).slice(0, 16);
}

const kind = (t: ItemType | null): ShareKind => t ?? 'None';

export function itemVisible(it: { type: ItemType | null; private: boolean }, a: Access): boolean {
	return !it.private && a.visible.has(kind(it.type));
}

export function filterItem(it: ItemRow, a: Access, viewerId: string): ItemDTO | null {
	if (it.parentId) return null; // steps are never shared
	const base = {
		date: it.date,
		time: it.time,
		endDate: it.endDate,
		parentId: null,
		private: false,
		stepsDone: 0,
		stepsTotal: 0,
		editable: false,
		theirs: true,
		owner: a.owner,
	};
	if (itemVisible(it, a))
		return { ...base, id: it.id, title: it.title, type: it.type, status: it.status as ItemDTO['status'] };
	if (a.hiddenAs === 'busy')
		return { ...base, id: busyId(it.id, viewerId), title: 'Busy', type: null, status: 'todo', busy: true };
	return null;
}

/** `linked` = the block's item (null if unlinked or deleted) */
export function filterBlock(
	b: BlockDTO,
	linked: { type: ItemType | null; private: boolean } | null,
	a: Access,
	viewerId: string,
): BlockDTO | null {
	const t = linked ? linked.type : b.type;
	const shown = a.visible.has('Blocks') && (linked ? itemVisible(linked, a) : a.visible.has(kind(t)));
	const base = { startAt: b.startAt, endAt: b.endAt, editable: false, theirs: true, owner: a.owner };
	if (shown)
		return {
			...base,
			id: b.id,
			label: b.label,
			// linked: visibility came from the item, so only its type is sent (never the block's own)
			type: linked ? null : b.type,
			itemType: linked ? linked.type : null,
			status: b.status,
			itemId: null, // their item ids stay theirs (nothing to open)
		};
	if (a.hiddenAs === 'busy')
		return {
			...base,
			id: busyId(b.id, viewerId),
			label: 'Busy',
			type: null,
			itemType: null,
			status: 'todo',
			itemId: null,
			busy: true,
		};
	return null;
}
