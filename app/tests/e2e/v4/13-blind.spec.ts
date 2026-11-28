// Blind tests for card 13 on desktop, from its Done-when lines only: C4 (a browser has no mic, no
// rationale sheet and no microphone code path on /keep) and C11 (dictation adds no undo entry and no
// toast; the note's existing autosave stays the only writer). No builder test was opened.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		// try both: this file also runs after flow.spec.ts, which reset jeremy's password
		for (const pw of [RESET_PW, PW]) {
			await p.fill('#u', 'jeremy');
			await p.fill('#p', pw);
			await p.click('button[type=submit]');
			await p.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!p.url().includes('/login')) break;
		}
	}
	await expect(p).not.toHaveURL(/\/(setup|login)/);
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** the fake Capacitor bridge: what the Android shell injects, with a queue of replies for the test */
async function installFakeSpeech(context: BrowserContext) {
	await context.addInitScript(() => {
		type Reply = { text: string } | { error: { code: string; message?: string } };
		const queue: Reply[] = [];
		const calls: { preferOffline?: boolean }[] = [];
		const pending: { resolve: (v: { text: string }) => void; reject: (e: unknown) => void }[] = [];
		const w = window as unknown as Record<string, unknown>;
		w.__speech = {
			calls,
			queue,
			resolveOldest: (text: string) => pending.shift()?.resolve({ text }),
		};
		w.Capacitor = {
			isNativePlatform: () => true,
			Plugins: {
				Speech: {
					listen: (opts: { preferOffline?: boolean }) => {
						calls.push(opts);
						const next = queue.shift();
						if (next)
							return 'text' in next ? Promise.resolve({ text: next.text }) : Promise.reject(next.error);
						return new Promise((resolve, reject) => pending.push({ resolve, reject }));
					},
				},
			},
		};
	});
}

const makeNote = (p: Page, title: string, body: string) =>
	p.evaluate(
		async ([t, b]) => {
			const r = await fetch('/api/keep/notes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: t, body: b }),
			});
			return ((await r.json()) as { note: { id: string } }).note.id;
		},
		[title, body] as const,
	);

async function openNote(p: Page, title: string) {
	await p.goto('/keep');
	await p.locator('article.note', { hasText: title }).getByText(title).click();
	const dlg = p.getByRole('dialog', { name: title, exact: true });
	await expect(dlg).toBeVisible();
	return dlg;
}

test('C4 a browser: no mic button, no rationale sheet and no microphone code path on /keep', async ({
	browser,
}) => {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	// count getUserMedia calls without adding a Capacitor plugin: this page is a plain browser
	await ctx.addInitScript(() => {
		const w = window as unknown as { __mic?: number };
		w.__mic = 0;
		const md = navigator.mediaDevices;
		const orig = md?.getUserMedia?.bind(md);
		if (md && orig)
			md.getUserMedia = (...a: Parameters<MediaDevices['getUserMedia']>) => {
				w.__mic = (w.__mic ?? 0) + 1;
				return orig(...a);
			};
	});
	const p = await ctx.newPage();
	await signIn(p);
	const title = 'Blind13 web';
	await makeNote(p, title, 'no mic here');
	const note = await openNote(p, title);

	// the note editor itself has no mic and no permission path
	await expect(note.getByRole('button', { name: 'Speak note' })).toHaveCount(0);
	await expect(p.getByRole('dialog', { name: 'Use the microphone?' })).toHaveCount(0);
	await expect(note.locator('textarea')).toHaveAttribute('placeholder', 'Note');
	await expect(p.evaluate(() => 'Capacitor' in window)).resolves.toBe(false);

	// the editor still works, and nothing ever asked for the microphone
	await note.locator('textarea').fill('typed on the web');
	await note.locator('textarea').click();
	await expect(p.getByText('Use the microphone?')).toHaveCount(0);
	expect(await p.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(0);
	await ctx.close();
});

test("C11 dictation only types: no new undo entry, no toast, the note's autosave stays the only writer", async ({
	browser,
}) => {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await installFakeSpeech(ctx);
	const p = await ctx.newPage();
	await signIn(p);
	const title = 'Blind13 undo';
	const id = await makeNote(p, title, 'alpha');
	const note = await openNote(p, title);
	const ta = note.locator('textarea');
	await ta.click();
	await p.keyboard.press('End');

	// record every API mutation from the moment dictation starts
	const reqs: string[] = [];
	p.on('request', (r) => {
		const u = new URL(r.url());
		if (u.pathname.startsWith('/api/')) reqs.push(`${r.method()} ${u.pathname}`);
	});

	// first tap: the in-app rationale; Continue starts the fake recognizer with one reply queued
	await p.evaluate(() => {
		(window as unknown as { __speech: { queue: unknown[] } }).__speech.queue.push({
			text: ' appended',
		});
	});
	await note.getByRole('button', { name: 'Speak note' }).click();
	const sheet = p.getByRole('dialog', { name: 'Use the microphone?' });
	await expect(sheet).toBeVisible();
	// BottomSheet's desktop scrim is z-index 72, above the Keep note card (71): the sheet is the top layer
	await sheet.getByRole('button', { name: 'Continue' }).click();
	await expect(sheet).toHaveCount(0);
	await expect(ta).toHaveValue('alpha appended');

	// saved by the note's own path, with no toast and no extra mutation
	await expect(note.getByRole('status')).toContainText('Saved');
	await expect(p.locator('.toast')).toHaveCount(0);
	await expect(p.locator('.undid')).toHaveCount(0);
	expect(reqs.filter((r) => !r.startsWith('GET '))).toEqual([`PATCH /api/keep/notes/${id}`]);
	const body = async () =>
		p.evaluate(async (nid) => {
			const r = await fetch(`/api/keep/notes/${nid}`);
			return ((await r.json()) as { note: { body: string } }).note.body;
		}, id);
	expect(await body()).toBe('alpha appended');

	// the note's own text undo applies: a real typed edit is undone in the field (the dictated insert is a
	// programmatic value change, which browsers never put on their undo stack), and the server journal is untouched
	await ta.click();
	await p.keyboard.press('End');
	await p.keyboard.type(' typed');
	await expect(ta).toHaveValue('alpha appended typed');
	await p.keyboard.press('Control+z');
	await expect.poll(async () => (await ta.inputValue()).trim()).toBe('alpha appended'); // the field undid it
	await p.waitForTimeout(500);
	expect(reqs.filter((r) => r === 'POST /api/undo')).toEqual([]);
	await expect(p.locator('.undid')).toHaveCount(0);
	await expect(p.locator('.toast')).toHaveCount(0);
	await ctx.close();
});
