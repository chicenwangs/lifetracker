// Alt-drag = copy (FEATURES §3, D-09). Hold Alt before or during a drag; the drop makes a copy and the source stays.
import { post } from './api';
import { calendarChanged } from './bus.svelte';
import { showError, showToast } from './toast.svelte';
import { undoLast } from './undo.svelte';
import type { UndoRef } from '$lib/types';

let dragging = false;
export const dragStarted = () => (dragging = true);
export const dragStopped = () => setTimeout(() => (dragging = false));

// Windows: releasing Alt focuses the browser menu bar (Firefox/Edge). Swallow it while a drag is on.
if (typeof window !== 'undefined')
	window.addEventListener('keyup', (e) => dragging && e.key === 'Alt' && e.preventDefault(), true);

/** copy an item to `date` or a block to `startAt`; one undo entry */
export async function duplicate(
	kind: 'item' | 'block',
	id: string,
	target: { date: string } | { startAt: string },
) {
	try {
		const r = await post<{ undo: UndoRef }>(
			`/api/${kind === 'item' ? 'items' : 'blocks'}/${id}/duplicate`,
			target,
		);
		calendarChanged();
		showToast(r.undo.label, { undo: () => void undoLast(r.undo.id) });
	} catch (e) {
		showError(e);
	}
}
