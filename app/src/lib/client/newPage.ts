// Create a page and open it. One in-flight latch for every "New page" button: a fast second tap while the first
// is still creating must not make a second (orphan) page (#307).
import { goto } from '$app/navigation';
import { post } from './api';
import { invalidateAll } from './refresh';
import { showError } from './toast.svelte';

let creating = false;

async function openNew(url: string, body: unknown): Promise<string | null> {
	if (creating) return null;
	creating = true;
	try {
		const r = await post<{ page: { id: string } }>(url, body);
		await invalidateAll();
		await goto(`/pages/${r.page.id}`);
		return r.page.id;
	} catch (e) {
		showError(e);
		return null;
	} finally {
		creating = false;
	}
}

/** returns the new page id, or null when another create is in flight or it failed */
export const createPage = (parentId: string | null): Promise<string | null> =>
	openNew('/api/pages', { parentId });

/** v4.0 PR 22: a copy of a template, titled "Untitled <name>", at the chosen parent (default top level) */
export const createFromTemplate = (
	templateId: string,
	parentId: string | null = null,
): Promise<string | null> => openNew(`/api/pages/${templateId}/from-template`, { parentId });
