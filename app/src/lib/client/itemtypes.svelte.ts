// The signed-in user's item types (from the root layout load). Every list, legend, picker and colour reads this.
import { defaultTypes } from '$lib/itemtypes';
import type { ItemTypeDTO } from '$lib/types';

export const typesState = $state<{ list: ItemTypeDTO[]; hidden: string[] }>({
	list: defaultTypes(),
	hidden: [],
});

export function initTypes(list: ItemTypeDTO[], hidden: string[]) {
	typesState.list = list;
	typesState.hidden = hidden;
}

export const typeOf = (key: string | null | undefined) =>
	key ? typesState.list.find((t) => t.key === key) : undefined;

/** label shown for a key: the user's name for it; unknown (partner's custom type) = null */
export const typeName = (key: string | null | undefined) => (key ? (typeOf(key)?.name ?? null) : 'No type');

/** quick-add context from the signed-in user's prefs + types (client preview = same rules as the server) */
export function qaPrefs(u: App.SafeUser | null | undefined) {
	return {
		types: typesState.list,
		qaTarget: u?.qaTarget === 'calendar' ? ('calendar' as const) : ('planner' as const),
		blockMin: u?.blockMin ?? 60,
		region: u?.region ?? ('my' as const),
	};
}

/** per-user hidden-type filter (type bar): drops my own rows of hidden types. Server still sends everything. */
export function shown<T extends { type: string | null; theirs?: boolean; itemType?: string | null }>(
	rows: T[],
): T[] {
	if (!typesState.hidden.length) return rows;
	return rows.filter(
		(r) => r.theirs || !typesState.hidden.includes(('itemType' in r ? r.itemType : null) ?? r.type ?? 'None'),
	);
}
