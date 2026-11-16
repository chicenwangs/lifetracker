// Phone "+ Add" sheet state (FEATURES §10). One sheet for the whole app, opened from the bottom bar or Today.
export const addSheet = $state<{ open: boolean; tab: 'plan' | 'note'; text: string }>({
	open: false,
	tab: 'plan',
	text: '',
});

export function openAdd(text = '', tab: 'plan' | 'note' = 'plan') {
	Object.assign(addSheet, { open: true, tab, text });
}
