// Phone "+ Add" sheet state (FEATURES §10). One sheet for the whole app, opened from the bottom bar or Today.
// Back closes it: BottomSheet gives it a history entry (layers.ts, #91).
// #93: `day` = the day on screen (no day typed -> that day); `from` = where the + was, the sheet grows from it.
import { peek } from './peek.svelte';

export const addSheet = $state<{
	open: boolean;
	tab: 'plan' | 'note';
	text: string;
	day: string | null;
	from: { x: number; y: number } | null;
}>({ open: false, tab: 'plan', text: '', day: null, from: null });

export function openAdd(
	text = '',
	tab: 'plan' | 'note' = 'plan',
	opts: { day?: string | null; from?: { x: number; y: number } | null } = {},
) {
	if (peek.id) return; // never stack two sheets (G10)
	Object.assign(addSheet, { open: true, tab, text, day: opts.day ?? null, from: opts.from ?? null });
}

export function closeAdd() {
	addSheet.open = false;
}
