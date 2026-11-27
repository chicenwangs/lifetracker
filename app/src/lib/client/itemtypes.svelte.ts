// The signed-in user's item types (from the root layout load). Every list, legend, picker and colour reads this.
import { defaultTypes, monthHidden } from '$lib/itemtypes';
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

/** card 10: the Month-only filter — my own items of a type with "Month calendar" off. Items only: a block's
 * type is never checked, so month cells keep their block dots (D-V4-11, D-V4-28). Runs on its own flag set,
 * independent of `hidden`. Partner rows and `No type` are never filtered. The rule itself is `monthHidden`
 * (shared with the phone Month server load, so SSR and the client cannot drift). */
export function shownOnMonth<T extends { type: string | null; theirs?: boolean }>(items: T[]): T[] {
	return monthHidden(items, typesState.list);
}
