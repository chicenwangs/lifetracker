// Blind tests for card 01 (Keep trash Restore), phone path (C6) and the empty state on phone (C7).
// Written from the Done-when lines only; runs in both phone projects (412×915 and the landscape bonus).
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Note = { id: string; title: string; trashed: boolean };
type Res = { status: number; json: unknown };
const noteOf = (r: Res) => (r.json as { note: Note }).note;
const notesOf = (r: Res) => (r.json as { notes: Note[] }).notes;

async function api(page: Page, method: string, path: string, body?: unknown): Promise<Res> {
	return page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b === undefined ? undefined : JSON.stringify(b),
			});
			let json: unknown = null;
			try {
				json = await r.json();
			} catch {
				// no JSON body
			}
			return { status: r.status, json };
		},
		[method, path, body] as const,
	);
}

async function purgeTrash(page: Page) {
	for (const n of notesOf(await api(page, 'GET', '/api/keep/notes?scope=trash')))
		expect((await api(page, 'DELETE', `/api/keep/notes/${n.id}`)).status).toBe(200);
}

test('C6 phone path: Trash shows Restore and Delete forever at >= 48 dp; tap Restore returns the note', async ({
	page,
}) => {
	await signIn(page);
	await purgeTrash(page);
	const title = `C6 blind ${RUN}`;
	const made = await api(page, 'POST', '/api/keep/notes', { type: 'text', title, body: 'blind test' });
	expect(made.status).toBe(201);
	const id = noteOf(made).id;
	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: true })).status).toBe(200);

	await page.goto('/keep?scope=trash');
	const card = page.locator('article.note', { hasText: title });
	await expect(card).toBeVisible();
	const restore = card.getByRole('button', { name: 'Restore', exact: true });
	const forever = card.getByRole('button', { name: 'Delete forever', exact: true });
	await expect(restore).toBeVisible();
	await expect(forever).toBeVisible();
	for (const b of [await restore.boundingBox(), await forever.boundingBox()]) {
		expect(b).toBeTruthy();
		expect(Math.round(b!.width)).toBeGreaterThanOrEqual(48);
		expect(Math.round(b!.height)).toBeGreaterThanOrEqual(48);
	}
	await expectTargets48(page);

	await restore.click();
	await expect(page.locator('.toast')).toContainText('Restored');
	await expect(page.getByText('Trash is empty.')).toBeVisible();
	await page.goto('/keep');
	await expect(page.locator('article.note', { hasText: title })).toBeVisible();
	expect(notesOf(await api(page, 'GET', '/api/keep/notes')).map((n) => n.id)).toContain(id);
	await noDesktopHints(page);
});

test('C7 phone empty state: "Trash is empty." shows and there is no Restore', async ({ page }) => {
	await signIn(page);
	await purgeTrash(page);
	await page.goto('/keep?scope=trash');
	await expect(page.getByText('Trash is empty.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);
});
