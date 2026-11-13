// Ctrl+Z / Cmd+Z = undo my newest action (server journal). Inside a text field, the field's own undo wins.
import { post } from './api';
import { calendarChanged } from './bus.svelte';
import { showError } from './toast.svelte';

/** centre "Undid: …" note (FEATURES §3: centre, 5 s, newest replaces old, never blocks clicks) */
export const undid = $state<{ text: string; id: number }>({ text: '', id: 0 });
let timer: ReturnType<typeof setTimeout> | null = null;

function note(label: string) {
	if (timer) clearTimeout(timer);
	undid.text = `Undid: ${label}`;
	undid.id++;
	timer = setTimeout(() => (undid.text = ''), 5000);
}

let busy = false;
/** undo the newest action, or a given one (toast Undo buttons pass the id the API returned) */
export async function undoLast(id?: string): Promise<boolean> {
	if (busy) return false;
	busy = true;
	try {
		const r = await post<{ label: string }>('/api/undo', id ? { id } : {});
		note(r.label);
		calendarChanged();
		return true;
	} catch (e) {
		showError(e);
		return false;
	} finally {
		busy = false;
	}
}

const typing = (el: EventTarget | null) =>
	el instanceof HTMLElement &&
	(el.isContentEditable ||
		['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
		!!el.closest('[contenteditable], canvas'));

export function onUndoKey(e: KeyboardEvent) {
	if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
	if (typing(e.target)) return; // native / editor undo
	e.preventDefault();
	void undoLast();
}
