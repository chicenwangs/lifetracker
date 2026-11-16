// Phone "+ Add" sheet state (FEATURES §10). One sheet for the whole app, opened from the bottom bar or Today.
// Back closes it: BottomSheet gives it a history entry (layers.ts, #91).
import { peek } from './peek.svelte';

export const addSheet = $state<{ open: boolean; tab: 'plan' | 'note'; text: string }>({
	open: false,
	tab: 'plan',
	text: '',
});

export function openAdd(text = '', tab: 'plan' | 'note' = 'plan') {
	if (peek.id) return; // never stack two sheets (G10)
	Object.assign(addSheet, { open: true, tab, text });
}

export function closeAdd() {
	addSheet.open = false;
}
