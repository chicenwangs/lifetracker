// Blind tests for card 13 on the phone projects, from its Done-when lines only: C5 (mic + listening),
// C6 (rationale), C7 (denied), C8 (caret + edit), C9 (view-only share), C10 (48 dp, Back, phone wording),
// C12 (states). The Android side is driven through my own fake Capacitor bridge: no real dictation is claimed.
// No builder test was opened.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { HINTS, expectTargets48, noDesktopHints, setHints } from './helpers';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // a desktop run resets jeremy's password
const RATIONALE = 'Life Tracker only listens while this button is on.';
const O7 = "Speech is turned into text by Android's speech service, on your phone when it can.";
const PERMISSION = 'Microphone is off for Life Tracker. Turn it on in Android settings.';

/** C3's bridge, injected before the app loads: isNativePlatform + Plugins.Speech.listen(opts) -> { text } */
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

let page: Page;
let BASE = '';
let T = '';
let noteId = '';

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		for (const pw of [PW, RESET_PW]) {
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
	await setHints(p, HINTS);
}

const note = () => page.getByRole('dialog', { name: T, exact: true });
const mic = () => note().getByRole('button', { name: 'Speak note' });
const body = () => note().getByRole('textbox').nth(1);
const sheet = () => page.getByRole('dialog', { name: 'Use the microphone?' });
const toast = () => page.locator('.toast');

const calls = () =>
	page.evaluate(() => (window as unknown as { __speech: { calls: unknown[] } }).__speech.calls);

/** queue the next listen() reply: { text } resolves, { code, message } rejects like the plugin does */
const prime = (reply: { text: string } | { code: string; message?: string }) =>
	page.evaluate((r) => {
		const s = (window as unknown as { __speech: { queue: unknown[] } }).__speech;
		s.queue.push('text' in r ? r : { error: r });
	}, reply);

/** what the real plugin does when the second listen stops the first: the pending call resolves with the text */
const finishOldest = (text: string) =>
	page.evaluate((t) => {
		const s = (window as unknown as { __speech: { resolveOldest: (v: string) => void } }).__speech;
		s.resolveOldest(t);
	}, text);

/** a second account, the way the e2e suite makes one: invite-only for a moment, one code, then /signup */
async function inviteCode() {
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	await expect(page.locator('[role="status"] code').first()).toBeVisible();
	const code = (await page.locator('[role="status"] code').first().innerText()).trim();
	expect(code).toMatch(/^INV-/);
	return code;
}

async function freshAccount(browser: Browser, username: string) {
	const code = await inviteCode();
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = test.info().project.use;
	const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	await installFakeSpeech(ctx); // the app shell, with the plugin, for the second account too
	const p = await ctx.newPage();
	await p.goto('/signup');
	await p.fill('#code', code);
	await p.fill('#nu', username);
	await p.fill('#dn', 'Viewer');
	await p.fill('#np', 'viewer pass phrase');
	await p.fill('#cp', 'viewer pass phrase');
	await p.getByRole('button', { name: 'Create account' }).click();
	await p.waitForURL((u) => u.pathname === '/' || u.pathname === '/today');
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await setHints(p, HINTS);
	return { ctx, p };
}

async function openNote() {
	// one fresh note per test with its own title: the list may already hold the earlier tests' notes
	T = `${BASE} ${Math.random().toString(36).slice(2, 7)}`;
	noteId = await page.evaluate(async (title) => {
		const r = await fetch('/api/keep/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, body: 'Hello world' }),
		});
		return ((await r.json()) as { note: { id: string } }).note.id;
	}, T);
	await page.goto('/keep');
	await page.locator('article.note', { hasText: T }).getByText(T).click();
	await expect(note()).toBeVisible();
	await body().fill('Hello world');
}

/** first tap in a fresh document shows the rationale; Continue starts the fake recognizer */
async function beginDictation() {
	await mic().click();
	const s = sheet();
	await s.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await s.isVisible().catch(() => false)) {
		await s.getByRole('button', { name: 'Continue' }).click();
		await expect(s).toHaveCount(0);
	}
}

async function placeCaret(start: number, end = start) {
	await body().evaluate(
		(el, [s, e]) => {
			(el as HTMLTextAreaElement).focus();
			(el as HTMLTextAreaElement).setSelectionRange(s, e);
		},
		[start, end] as const,
	);
}

async function dismissToast() {
	await toast().getByRole('button', { name: 'Close' }).click();
	await expect(toast()).toHaveCount(0);
}

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	const context = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
	await installFakeSpeech(context);
	page = await context.newPage();
	await signIn(page);
	T = `Mic ${info.project.name}`;
	BASE = T;
});

test.afterAll(async () => {
	await page
		.context()
		.setOffline(false)
		.catch(() => {});
	await page.context().close();
});

test('C5 idle mic right of the body field, 48 dp, named "Speak note"; listening = filled + pulsing ring + "Listening…"; a second tap stops and keeps what arrived', async () => {
	await openNote();
	const b = (await body().boundingBox())!;
	const m = (await mic().boundingBox())!;
	expect(Math.round(m.width)).toBeGreaterThanOrEqual(48);
	expect(Math.round(m.height)).toBeGreaterThanOrEqual(48);
	expect(m.x).toBeGreaterThan(b.x + b.width - 1); // right of the field
	await expect(mic()).toHaveAccessibleName('Speak note');
	await expect(mic().locator('svg')).toHaveAttribute('fill', 'none'); // outline mic
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await expect(body()).toHaveAttribute('placeholder', 'Note');

	await beginDictation(); // this document's first tap: the rationale's Continue starts it
	await expect(body()).toHaveAttribute('placeholder', 'Listening…');
	await expect(mic()).toHaveAttribute('aria-pressed', 'true');
	await expect(mic().locator('svg')).toHaveAttribute('fill', 'currentColor'); // filled
	await expect(mic()).toHaveCSS('animation-name', /-mic-listen$/); // pulsing ring
	expect(await calls()).toEqual([{ preferOffline: true }]);

	// a second tap stops: the plugin answers with whatever has arrived, and it stays in the note
	await placeCaret('Hello world'.length);
	await prime({ text: ' from speech' });
	await mic().click();
	await expect(body()).toHaveValue('Hello world from speech');
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await expect(body()).toHaveAttribute('placeholder', 'Note');
	expect(await calls()).toHaveLength(2);
	await finishOldest(''); // the stopped first call resolves with nothing: no extra text
	await expect(body()).toHaveValue('Hello world from speech');
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
});

test('C6 first tap shows the in-app rationale before Android with the exact line and O-7 sentence; Not now closes it and requests nothing', async () => {
	await openNote();
	await mic().click();
	const s = sheet();
	await expect(s).toBeVisible();
	await expect(s.getByRole('heading', { name: 'Use the microphone?' })).toBeVisible();
	await expect(s.getByText(RATIONALE, { exact: true })).toBeVisible();
	await expect(s.getByText(O7, { exact: true })).toBeVisible();
	await expect(s.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
	await expect(s.getByRole('button', { name: 'Not now', exact: true })).toBeVisible();
	expect(await calls()).toEqual([]); // Android's own dialog only comes after Continue

	await s.getByRole('button', { name: 'Not now', exact: true }).click();
	await expect(s).toHaveCount(0);
	await expect(note()).toBeVisible();
	expect(await calls()).toEqual([]); // Not now requests nothing
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
});

test('C7 a denial greys the mic but never disables it; every tap still calls listen(); a later grant works on the next tap and the rationale never re-opens', async () => {
	await openNote();
	await prime({ code: 'permission' });
	await beginDictation();
	await expect(toast()).toContainText(PERMISSION);
	await expect(mic()).toHaveCSS('opacity', '0.45');
	await expect(mic()).toBeEnabled();
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await expect(sheet()).toHaveCount(0);
	expect(await calls()).toHaveLength(1);
	await dismissToast();

	// a grant made in Android settings works on the very next tap: no reload, no rationale again
	await placeCaret('Hello world'.length);
	await prime({ text: ' back on' });
	await mic().click();
	await expect(body()).toHaveValue('Hello world back on');
	await expect(mic()).toHaveCSS('opacity', '1');
	await expect(sheet()).toHaveCount(0);
	expect(await calls()).toHaveLength(2);
});

test('C8 the recognised text goes in at the caret without replacing the selection, then the note autosaves; an empty result leaves it unchanged', async () => {
	await openNote();
	await body().fill('Hello world');
	await placeCaret(6, 11); // selects "world"
	await prime({ text: 'big ' });
	await beginDictation();
	await expect(body()).toHaveValue('Hello big world'); // "world" is kept, the text went in before it
	await expect.poll(() => body().evaluate((el) => (el as HTMLTextAreaElement).selectionStart)).toBe(10);
	await expect(note().getByRole('status')).toContainText('Saved'); // the existing Keep autosave wrote it
	expect(
		await page.evaluate(async (id) => {
			const r = await fetch(`/api/keep/notes/${id}`);
			return ((await r.json()) as { note: { body: string } }).note.body;
		}, noteId),
	).toBe('Hello big world');

	// empty result: the note stays exactly as it was and the button goes back to idle
	await placeCaret(5);
	await prime({ text: '' });
	await mic().click();
	await expect(body()).toHaveValue('Hello big world');
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await expect(body()).toHaveAttribute('placeholder', 'Note');
});

test('C12 listening is the pulsing "Listening…" state (no spinner); no_service and other errors show their toast and return to idle; offline dictation still runs and the note keeps its Offline state', async () => {
	await openNote();
	// loading: no reply queued, so the fake recognizer stays open
	await beginDictation();
	await expect(body()).toHaveAttribute('placeholder', 'Listening…');
	await expect(mic()).toHaveCSS('animation-name', /-mic-listen$/);
	expect(await note().locator('[role=progressbar], .spinner').count()).toBe(0);
	await finishOldest('');
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await expect(body()).toHaveAttribute('placeholder', 'Note');

	// no speech recognizer on the phone: one fixed info toast, button idle
	await prime({ code: 'no_service' });
	await mic().click();
	await expect(toast()).toContainText("Speech isn't available on this phone.");
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await dismissToast();

	// anything else goes to the existing error toast, button idle
	await prime({ code: 'engine', message: 'Recognizer busy' });
	await mic().click();
	await expect(toast()).toContainText('Recognizer busy');
	await expect(mic()).toHaveAttribute('aria-pressed', 'false');
	await dismissToast();

	// offline: dictation runs on the phone; the note keeps its existing Offline state until it syncs
	await page.context().setOffline(true);
	try {
		await placeCaret('Hello world'.length);
		await prime({ text: ' offline' });
		await mic().click();
		await expect(body()).toHaveValue('Hello world offline');
		const status = note().getByRole('status');
		await expect(status).toContainText(/Offline\s+·\s+kept on this device, sends when you're back/);
		await page.context().setOffline(false);
		await expect(status).toHaveText('Saved', { timeout: 15000 });
	} finally {
		await page.context().setOffline(false);
	}
});

test('C10 phone: the mic is 48 dp, the rationale uses the shared sheet and Back closes the sheet before the note, with no desktop wording and 48 dp targets', async () => {
	await openNote(); // a fresh document: the first tap's rationale is available
	const m = (await mic().boundingBox())!;
	expect(Math.round(m.width)).toBeGreaterThanOrEqual(48);
	expect(Math.round(m.height)).toBeGreaterThanOrEqual(48);
	await body().focus(); // typing state, like keepnote.spec.ts
	await expectTargets48(page);
	await noDesktopHints(page);

	await mic().click();
	const s = sheet();
	await expect(s).toBeVisible();
	await expectTargets48(page);
	await noDesktopHints(page); // the mic, the sheet and their accessible names carry no Click/Ctrl/Esc/PC copy

	await page.goBack(); // one Back = the sheet, not the note
	await expect(s).toHaveCount(0);
	await expect(note()).toBeVisible();
	await noDesktopHints(page);
});

test('C9 a note shared view-only never shows the mic, the rationale sheet or the listening state', async ({
	browser,
}) => {
	const viewerName = `view${Math.random().toString(36).slice(2, 7)}`;
	const { ctx: vctx, p: vp } = await freshAccount(browser, viewerName);
	// the bridge is in this context: the missing mic below comes from the share, not from a web-only page
	expect(await vp.evaluate(() => 'Capacitor' in window)).toBe(true);

	// control: the same bridge in the same context shows the mic on the viewer's own note
	const ownTitle = `${viewerName} own`;
	await vp.evaluate(async (title) => {
		await fetch('/api/keep/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, body: 'mine' }),
		});
	}, ownTitle);
	await vp.goto('/keep');
	await vp.locator('article.note', { hasText: ownTitle }).getByText(ownTitle).click();
	const own = vp.getByRole('dialog', { name: ownTitle, exact: true });
	await expect(own).toBeVisible();
	await expect(own.getByRole('button', { name: 'Speak note' })).toBeVisible();
	await vp.goBack();
	await expect(own).toHaveCount(0);

	// Jeremy's note, shared view-only with that account
	await openNote();
	const shared = await page.evaluate(
		async ([id, username]) => {
			const r = await fetch(`/api/shares/note/${id}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username, permission: 'view' }),
			});
			return { status: r.status, json: (await r.json()) as unknown };
		},
		[noteId, viewerName] as const,
	);
	expect(shared.status, JSON.stringify(shared.json)).toBe(200);

	// the viewer opens it from Shared with me: no mic, no rationale, no listening state
	await vp.goto('/keep?scope=shared');
	await vp.locator('article.note', { hasText: T }).getByText(T).click();
	const sharedNote = vp.getByRole('dialog', { name: T, exact: true });
	await expect(sharedNote).toBeVisible();
	await expect(sharedNote).toContainText('Shared with you');
	await expect(sharedNote).toContainText('view only');
	await expect(sharedNote.getByRole('button', { name: 'Speak note' })).toHaveCount(0);
	await expect(vp.getByRole('dialog', { name: 'Use the microphone?' })).toHaveCount(0);
	await expect(vp.getByText('Listening…')).toHaveCount(0);
	await expect(sharedNote.getByRole('textbox').nth(1)).toHaveAttribute('placeholder', 'Note');

	// tapping the composer where the mic would be opens nothing and starts nothing
	await sharedNote.getByRole('textbox').nth(1).click({ force: true });
	await expect(vp.getByRole('dialog', { name: 'Use the microphone?' })).toHaveCount(0);
	await expect(vp.getByText('Listening…')).toHaveCount(0);
	expect(await vp.evaluate(() => 'Capacitor' in window)).toBe(true); // still the app shell

	await vctx.close();
});
