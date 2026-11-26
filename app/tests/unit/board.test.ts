// v4 PR 23: board grouping = options in their order, then "No value"; unknown ids fall into "No value".
import { describe, expect, it } from 'vitest';
import { boardGroups } from '../../src/lib/database/board';
import type { DbProp, DbRow } from '../../src/lib/types';

const prop: DbProp = {
	id: 'p1',
	name: 'Status',
	type: 'select',
	config: {
		options: [
			{ id: 'o1', label: 'Todo', color: 'work' },
			{ id: 'o2', label: 'Doing', color: 'hobby' },
		],
	},
};
const row = (id: string, v?: unknown): DbRow => ({
	id,
	pageId: null,
	values: v === undefined ? {} : { p1: v },
});

describe('boardGroups', () => {
	it('keeps option order and puts the unset/unknown rows last in "No value"', () => {
		const g = boardGroups([row('r1', 'o2'), row('r2'), row('r3', 'o1'), row('r4', 'gone')], prop);
		expect(g.map((x) => [x.id, x.label, x.color, x.rows.map((r) => r.id)])).toEqual([
			['o1', 'Todo', 'work', ['r3']],
			['o2', 'Doing', 'hobby', ['r1']],
			['', 'No value', null, ['r2', 'r4']],
		]);
	});
	it('always ends with "No value", even when it is empty or there are no options', () => {
		const g = boardGroups([row('r1', 'o1')], prop);
		expect(g.at(-1)).toMatchObject({ id: '', label: 'No value', rows: [] });
		const empty = boardGroups([row('r1')], { ...prop, config: {} });
		expect(empty).toHaveLength(1);
		expect(empty[0]).toMatchObject({ id: '', label: 'No value' });
	});
});
