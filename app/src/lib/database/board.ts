// Board view grouping (v4 PR 23). Columns = the select property's options in order, then one "No value" column.
// Pure: the component renders the groups and the unit test pins the order and the leftovers.
import type { DbProp, DbRow } from '$lib/types';

export interface BoardGroup {
	id: string;
	label: string;
	color: string | null;
	rows: DbRow[];
}

export const NO_VALUE = '';

export function boardGroups(rows: DbRow[], prop: DbProp): BoardGroup[] {
	const options = prop.config.options ?? [];
	const groups: BoardGroup[] = options.map((o) => ({
		id: o.id,
		label: o.label,
		color: o.color ?? null,
		rows: [],
	}));
	const none: BoardGroup = { id: NO_VALUE, label: 'No value', color: null, rows: [] };
	for (const r of rows) {
		const v = r.values[prop.id];
		const g = typeof v === 'string' ? groups.find((x) => x.id === v) : undefined;
		(g ?? none).rows.push(r);
	}
	return [...groups, none];
}
