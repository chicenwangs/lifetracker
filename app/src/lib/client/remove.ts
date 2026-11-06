// Quick delete (hover X) with 5 s undo. Soft delete server side; undo = trash batch restore.
import { del, post } from './api';
import { showError, showToast } from './toast.svelte';

async function removeWithUndo(path: string, what: string, onchanged: () => void | Promise<void>) {
	try {
		const r = await del<{ batch?: string }>(path);
		await onchanged();
		const batch = r.batch;
		showToast(`Deleted "${what}"`, {
			undo: batch
				? async () => {
						try {
							await post(`/api/trash/${batch}/restore`);
							await onchanged();
						} catch (e) {
							showError(e);
						}
					}
				: undefined,
		});
	} catch (e) {
		showError(e);
	}
}

export const removeItem = (id: string, title: string, onchanged: () => void | Promise<void>) =>
	removeWithUndo(`/api/items/${id}`, title, onchanged);

export const removeBlock = (id: string, label: string, onchanged: () => void | Promise<void>) =>
	removeWithUndo(`/api/blocks/${id}`, label, onchanged);
