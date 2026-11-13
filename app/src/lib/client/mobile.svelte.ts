// Phone "+ Add" sheet state (FEATURES §10). One sheet for the whole app, opened from the bottom bar or Today.
export const addSheet = $state<{
	open: boolean;
	tab: 'plan' | 'note';
	text: string;
	itemId: string | null;
	title: string;
}>({
	open: false,
	tab: 'plan',
	text: '',
	itemId: null,
	title: '',
});

/** open the sheet; with an item id it asks for a time for that item instead ("No time set" clock button) */
export function openAdd(text = '', itemId: string | null = null, tab: 'plan' | 'note' = 'plan') {
	Object.assign(addSheet, { open: true, tab, text, itemId, title: itemId ? text.trim() : '' });
}
