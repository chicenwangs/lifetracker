import type { BlockDTO, ItemDTO } from './types';

/**
 * #398: a block linked to an item that is already listed for the day draws the same entry twice.
 * Hide the block row; the item occurrence row (with its Skip this one action) represents it.
 */
export function withoutLinkedBlocks(blocks: BlockDTO[], items: ItemDTO[], day: string): BlockDTO[] {
	const listed = new Set(items.filter((i) => i.time && i.date === day).map((i) => i.seriesId ?? i.id));
	return blocks.filter((b) => !b.itemId || !listed.has(b.itemId));
}
