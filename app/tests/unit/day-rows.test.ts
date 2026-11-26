// #398: a block linked to an item already listed for the day is redundant on Today.
import { describe, expect, it } from 'vitest';
import { withoutLinkedBlocks } from '../../src/lib/day-rows';
import type { BlockDTO, ItemDTO } from '../../src/lib/types';

const item = (over: Partial<ItemDTO>): ItemDTO => ({
	id: 'itm_a',
	title: 'A',
	type: null,
	status: 'todo',
	date: '2026-11-26',
	time: null,
	endDate: null,
	parentId: null,
	private: false,
	stepsDone: 0,
	stepsTotal: 0,
	editable: true,
	...over,
});
const block = (over: Partial<BlockDTO>): BlockDTO => ({
	id: 'blk_a',
	label: 'A',
	type: null,
	startAt: '2026-11-26T01:00:00Z',
	endAt: '2026-11-26T02:00:00Z',
	status: 'todo',
	itemId: null,
	itemType: null,
	editable: true,
	...over,
});

describe('withoutLinkedBlocks', () => {
	it('drops the block of a timed item listed that day', () => {
		const items = [item({ id: 'itm_a', time: '09:00' })];
		const blocks = [block({ id: 'blk_a', itemId: 'itm_a' }), block({ id: 'blk_b' })];
		expect(withoutLinkedBlocks(blocks, items, '2026-11-26').map((b) => b.id)).toEqual(['blk_b']);
	});
	it('matches a repeating occurrence through seriesId', () => {
		const items = [item({ id: 'itm_b@2026-11-26', seriesId: 'itm_b', time: '09:00', rrule: 'FREQ=DAILY' })];
		const blocks = [block({ id: 'blk_b', itemId: 'itm_b' })];
		expect(withoutLinkedBlocks(blocks, items, '2026-11-26')).toEqual([]);
	});
	it('keeps the block when the item is another day, has no time, or is not listed', () => {
		const items = [
			item({ id: 'itm_a', time: '09:00', date: '2026-11-25' }), // another day
			item({ id: 'itm_b', time: null }), // all-day: no row
		];
		const blocks = [
			block({ id: 'blk_a', itemId: 'itm_a' }),
			block({ id: 'blk_b', itemId: 'itm_b' }),
			block({ id: 'blk_c', itemId: 'itm_c' }), // item not in the payload
		];
		expect(withoutLinkedBlocks(blocks, items, '2026-11-26').map((b) => b.id)).toEqual([
			'blk_a',
			'blk_b',
			'blk_c',
		]);
	});
});
