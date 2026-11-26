// Blind tests for card 01 (Keep trash Restore), written from the Done-when lines only (C1–C8).
// Desktop project; the phone path (C6) lives in app/tests/e2e/phone/v4-01-blind.spec.ts.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; try both so this file also runs after that one.
const RESET_PW = 'reset pass phrase 1';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Note = { id: string; title: string; trashed: boolean };
type Res = { status: number; json: unknown };
const noteOf = (r: Res) => (r.json as { note: Note }).note;
const notesOf = (r: Res) => (r.json as { notes: Note[] }).notes;
const errorOf = (r: Res) => (r.json as { error: { code: string; message: string } }).error;

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of [PW, RESET_PW]) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

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

const createNote = async (page: Page, title: string) => {
	const r = await api(page, 'POST', '/api/keep/notes', { type: 'text', title, body: 'blind test' });
	expect(r.status).toBe(201);
	return noteOf(r).id;
};

const trashNote = async (page: Page, id: string) =>
	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: true })).status).toBe(200);

const scopeIds = async (page: Page, scope: '' | 'trash') =>
	notesOf(await api(page, 'GET', `/api/keep/notes${scope ? `?scope=${scope}` : ''}`)).map((n) => n.id);

/** empty the trash so the empty-state checks do not depend on other specs */
async function purgeTrash(page: Page) {
	for (const n of notesOf(await api(page, 'GET', '/api/keep/notes?scope=trash')))
		expect((await api(page, 'DELETE', `/api/keep/notes/${n.id}`)).status).toBe(200);
}

async function newUser(browser: Browser, username: string) {
	const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
	const page = await ctx.newPage();
	await page.goto('/signup');
	await page.fill('#nu', username);
	await page.fill('#dn', `Blind ${username}`);
	await page.fill('#np', PW);
	await page.fill('#cp', PW);
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.waitForURL((u) => u.pathname === '/');
	const skip = page.getByRole('button', { name: 'Skip tour' });
	if (await skip.isVisible().catch(() => false)) await skip.click();
	return { ctx, page };
}

function repoRoot() {
	let dir = process.cwd();
	for (let i = 0; i < 6; i++) {
		if (existsSync(join(dir, 'AGENTS.md'))) return dir;
		dir = dirname(dir);
	}
	throw new Error('repo root not found (no AGENTS.md above the test cwd)');
}
const repoFile = (name: string) => readFileSync(join(repoRoot(), name), 'utf8');

test('C1 owner path (API): PATCH {trashed:false} returns 200, trashed false, leaves Trash, back in active', async ({
	page,
}) => {
	await signIn(page);
	const id = await createNote(page, `C1 blind ${RUN}`);
	await trashNote(page, id);
	expect(await scopeIds(page, 'trash')).toContain(id);

	const r = await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: false });
	expect(r.status).toBe(200);
	expect(noteOf(r).trashed).toBe(false);
	expect(await scopeIds(page, 'trash')).not.toContain(id);
	expect(await scopeIds(page, '')).toContain(id);
});

test('C2 permission (API): another user and a shared-with user get 404 not_found; the note stays in Trash', async ({
	browser,
	page,
}) => {
	await signIn(page);
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="1"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	const stranger = await newUser(browser, `blind${RUN}s`);
	const sharedWith = await newUser(browser, `blind${RUN}h`);
	try {
		const id = await createNote(page, `C2 blind ${RUN}`);
		// share while the note is live: level() is owner-only once the row is trashed
		const share = await page.evaluate(
			async ([note, username]) => {
				const r = await fetch(`/api/shares/note/${note}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ username, permission: 'edit' }),
				});
				return { status: r.status, json: await r.json().catch(() => null) };
			},
			[id, `blind${RUN}h`] as const,
		);
		expect(share.status).toBe(200);
		await trashNote(page, id);

		for (const [who, u] of [
			['another user', stranger],
			['a shared-with user', sharedWith],
		] as const) {
			const r = await api(u.page, 'PATCH', `/api/keep/notes/${id}`, { trashed: false });
			expect(r.status, `${who} must get 404`).toBe(404);
			expect(errorOf(r).code, who).toBe('not_found');
		}
		expect(await scopeIds(page, 'trash')).toContain(id);
	} finally {
		await stranger.ctx.close();
		await sharedWith.ctx.close();
	}
});

test('C3 desktop: delete a note, Trash -> Restore makes Trash empty and the note visible on /keep', async ({
	page,
}) => {
	await signIn(page);
	await purgeTrash(page);
	const title = `C3 blind ${RUN}`;
	await createNote(page, title);
	await page.goto('/keep');
	const card = page.locator('article.note', { hasText: title });
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('Moved to Trash');
	await expect(card).toHaveCount(0);

	await page.goto('/keep?scope=trash');
	const trashed = page.locator('article.note', { hasText: title });
	await expect(trashed).toBeVisible();
	await trashed.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(page.locator('.toast')).toContainText('Restored');
	await expect(page.getByText('Trash is empty.')).toBeVisible();
	await page.goto('/keep');
	await expect(page.locator('article.note', { hasText: title })).toBeVisible();
});

test('C4 undo: the Restored toast Undo sends {trashed:true} and puts the note back in Trash', async ({
	page,
}) => {
	await signIn(page);
	const title = `C4 blind ${RUN}`;
	const id = await createNote(page, title);
	await trashNote(page, id);
	await page.goto('/keep?scope=trash');

	const bodies: { trashed?: boolean }[] = [];
	page.on('request', (r) => {
		if (r.method() === 'PATCH' && r.url().includes(`/api/keep/notes/${id}`))
			bodies.push(r.postDataJSON() as { trashed?: boolean });
	});

	await page.locator('article.note', { hasText: title }).getByRole('button', { name: 'Restore' }).click();
	const toast = page.locator('.toast');
	await expect(toast).toContainText('Restored');
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => bodies.some((b) => b?.trashed === true)).toBe(true);
	expect(bodies.map((b) => b.trashed)).toEqual([false, true]);
	await expect(page.locator('article.note', { hasText: title })).toBeVisible();
	expect(await scopeIds(page, 'trash')).toContain(id);
});

test('C5 access: shares.ts unchanged; a trashed note 404s on read/edit; a restored note is editable', async ({
	page,
}) => {
	const diff = execFileSync(
		'git',
		[
			'-C',
			repoRoot(),
			'diff',
			'--name-only',
			'origin/main...HEAD',
			'--',
			'app/src/lib/server/repo/shares.ts',
		],
		{ encoding: 'utf8' },
	);
	expect(diff.trim()).toBe('');

	await signIn(page);
	const id = await createNote(page, `C5 blind ${RUN}`);
	await trashNote(page, id);
	const read = await api(page, 'GET', `/api/keep/notes/${id}`);
	expect(read.status).toBe(404);
	expect(errorOf(read).code).toBe('not_found');
	const edit = await api(page, 'PATCH', `/api/keep/notes/${id}`, { title: 'must not land' });
	expect(edit.status).toBe(404);
	expect(errorOf(edit).code).toBe('not_found');

	expect((await api(page, 'PATCH', `/api/keep/notes/${id}`, { trashed: false })).status).toBe(200);
	const write = await api(page, 'PATCH', `/api/keep/notes/${id}`, { title: 'edited after restore' });
	expect(write.status).toBe(200);
	expect(noteOf(write).title).toBe('edited after restore');
});

test('C7 states: empty Trash shows "Trash is empty." with no Restore; the page is server-rendered', async ({
	page,
}) => {
	await signIn(page);
	await purgeTrash(page);
	// no loading skeleton: the server-rendered HTML already carries the final state
	const html = await (await page.request.get('/keep?scope=trash')).text();
	expect(html).toContain('Trash is empty.');
	await page.goto('/keep?scope=trash');
	await expect(page.getByText('Trash is empty.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);
});

test('C8 docs: no Keep-restore line in Known issues or CLAUDE.md; both docs say Restore from Trash works', async () => {
	const known = repoFile('AGENTS.md')
		.split(/^## /m)
		.find((s) => s.startsWith('Known issues'));
	expect(known).toBeTruthy();
	const items = (known as string).split('\n').filter((l) => /^\d+\. /.test(l));
	expect(items).toHaveLength(3);
	expect(items.join('\n')).not.toMatch(/keep|restore/i);

	const claude = repoFile('CLAUDE.md')
		.split('\n')
		.filter((l) => /keep/i.test(l) && /restore/i.test(l));
	expect(claude).toEqual([]);

	for (const f of ['docs/BUILD-NOTES.md', 'docs/v2/FEATURES.md']) {
		const line = repoFile(f)
			.split('\n')
			.find((l) => l.includes('Restore from Trash works'));
		expect(line, `${f} must say Restore from Trash works`).toBeTruthy();
		expect(line, `${f} must not cite an issue number as evidence`).not.toMatch(/#\d+/);
	}
});
