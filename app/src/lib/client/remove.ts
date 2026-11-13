// Quick delete (hover X) with 5 s undo. Soft delete server side; Undo = the same journal entry Ctrl+Z uses.
import { del } from './api';
import { showError, showToast } from './toast.svelte';
import { undoLast } from './undo.svelte';
import type { UndoRef } from '$lib/types';

async function removeWithUndo(path: string, what: string, onchanged: () => void | Promise<void>) {
	try {
		const r = await del<{ undo?: UndoRef }>(path);
		await onchanged();
		const u = r.undo;
		showToast(`Deleted "${what}"`, {
			undo: u ? async () => void ((await undoLast(u.id)) && (await onchanged())) : undefined,
		});
	} catch (e) {
		showError(e);
	}
}

export const removeItem = (id: string, title: string, onchanged: () => void | Promise<void>) =>
	removeWithUndo(`/api/items/${id}`, title, onchanged);

export const removeBlock = (id: string, label: string, onchanged: () => void | Promise<void>) =>
	removeWithUndo(`/api/blocks/${id}`, label, onchanged);
