// Card 01 (D-V4-02): the Keep trash Restore regression lock. #244 fixed the route; level()/need() still hide
// trashed rows, so this spec pins the owner's restore plus the 404s for anyone else. No behaviour change.
import { expect, test, type Browser, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run of this file has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of PASSWORDS) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForURL((u) => !/^\/(login|setup)/.test(u.pathname), { timeout: 5000 }).catch(() => {});
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** make one member account through the open-sign-up flow, signed in */
async function newUser(browser: Browser, username: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/signup');
	await page.fill('#nu', username);
	await page.fill('#dn', `Restore ${username}`);
	await page.fill('#np', `${PW} 2`);
	await page.fill('#cp', `${PW} 2`);
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.waitForURL((u) => u.pathname === '/');
	await page.getByRole('button', { name: 'Skip tour' }).click();
	return { ctx, page };
}

/** JSON fetch as the page's user (same helper shape as flow.spec.ts) */
const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: await r.json().catch(() => null) };
		},
		[m, p, b] as const,
	);

const ids = (r: { j: { notes: { id: string }[] } }) => r.j.notes.map((n) => n.id);

test('C1 owner restores a trashed note; C5 trashed reads/edits 404 and the restored note is editable', async ({
	page,
}) => {
	await signIn(page);
	const title = `C1 restore ${Date.now()}`;
	const made = await api(page, 'POST', '/api/keep/notes', { title, body: 'restore me' });
	expect(made.s).toBe(201);
	const id = made.j.note.id as string;
	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: true })).s).toBe(200);
	expect(ids(await api(page, 'GET', '/api/keep/notes?scope=trash'))).toContain(id);
	expect(ids(await api(page, 'GET', '/api/keep/notes'))).not.toContain(id);

	// C5: level() still hides a trashed row from the read + edit paths
	const read = await api(page, 'GET', `/api/keep/notes/${id}`);
	expect(read.s).toBe(404);
	expect(read.j.error.code).toBe('not_found');
	const edit = await api(page, 'PATCH', `/api/keep/notes/${id}`, { title: 'nope' });
	expect(edit.s).toBe(404);
	expect(edit.j.error.code).toBe('not_found');

	// C1: the owner's PATCH {trashed:false} is the restore
	const back = await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: false });
	expect(back.s).toBe(200);
	expect(back.j.note.trashed).toBe(false);
	expect(ids(await api(page, 'GET', '/api/keep/notes?scope=trash'))).not.toContain(id);
	expect(ids(await api(page, 'GET', '/api/keep/notes'))).toContain(id);

	// C5: restored means editable again
	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { title: `${title} edited` })).s).toBe(200);
});

test('C2 only the owner can restore: another user and a shared-with user get 404', async ({
	page,
	browser,
}) => {
	await signIn(page);
	// new installs start invite-only, so the owner opens sign-up first
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="1"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	const stamp = Date.now().toString(36);
	const other = await newUser(browser, `stranger${stamp}`);
	const mate = await newUser(browser, `mate${stamp}`);
	const made = await api(page, 'POST', '/api/keep/notes', { title: `C2 restore ${stamp}`, body: 'mine' });
	expect(made.s).toBe(201);
	const id = made.j.note.id as string;
	// share while still active: shares need a live row, the restore attempt needs a trashed one
	expect((await api(page, 'POST', `/api/shares/note/${id}`, { username: `mate${stamp}`, permission: 'edit' })).s).toBe(200); // prettier-ignore
	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: true })).s).toBe(200);

	for (const p of [other.page, mate.page]) {
		const r = await api(p, 'PATCH', `/api/keep/notes/${id}`, { trashed: false });
		expect(r.s).toBe(404);
		expect(r.j.error.code).toBe('not_found');
	}
	expect(ids(await api(page, 'GET', '/api/keep/notes?scope=trash'))).toContain(id); // still the owner's Trash
	expect((await api(page, 'DELETE', `/api/keep/notes/${id}`)).s).toBe(200); // cleanup: Trash empty for C3
	await other.ctx.close();
	await mate.ctx.close();
});

test('C3 desktop Delete -> Trash -> Restore; C7 the empty Trash has no Restore', async ({ page }) => {
	await signIn(page);
	// this spec owns the Trash in the temp e2e DB, so "Trash is empty." is about our note
	for (const n of (await api(page, 'GET', '/api/keep/notes?scope=trash')).j.notes) {
		expect((await api(page, 'DELETE', `/api/keep/notes/${n.id}`)).s).toBe(200);
	}
	const title = `C3 restore ${Date.now()}`;
	const made = await api(page, 'POST', '/api/keep/notes', { title, body: 'x' });
	expect(made.s).toBe(201);
	await page.goto('/keep');
	const card = page.locator('article.note', { hasText: title });
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Delete' }).click();
	await expect(card).toHaveCount(0);

	await page.goto('/keep?scope=trash');
	const trashed = page.locator('article.note', { hasText: title });
	await expect(trashed).toBeVisible();
	await trashed.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(page.getByText('Trash is empty.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0); // C7: nothing to restore

	await page.goto('/keep');
	await expect(page.locator('article.note', { hasText: title })).toBeVisible();
});

test('C4 Undo after Restore sends {trashed:true} and puts the note back in Trash', async ({ page }) => {
	await signIn(page);
	const title = `C4 undo ${Date.now()}`;
	const made = await api(page, 'POST', '/api/keep/notes', { title, body: 'x' });
	expect(made.s).toBe(201);
	const id = made.j.note.id as string;
	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: true })).s).toBe(200);

	await page.goto('/keep?scope=trash');
	const card = page.locator('article.note', { hasText: title });
	await card.getByRole('button', { name: 'Restore', exact: true }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Restored');
	const undo = page.waitForRequest((r) => {
		if (r.method() !== 'PATCH' || !r.url().endsWith(`/api/keep/notes/${id}`)) return false;
		try {
			return r.postDataJSON()?.trashed === true;
		} catch {
			return false;
		}
	});
	await toast.getByRole('button', { name: 'Undo' }).click();
	expect((await undo).postDataJSON()).toEqual({ trashed: true });
	await expect(card).toBeVisible(); // the refresh shows it in Trash again
	expect((await api(page, 'DELETE', `/api/keep/notes/${id}`)).s).toBe(200); // cleanup
});
