// Card 13 (O-7, O-8, D-V4-20): on the phone the web build has no microphone — no mic button, no rationale
// sheet — and the open note keeps its 48 dp targets and its phone-only wording (C4, C10).
// The app-only mic is checked here with a faked Capacitor bridge (the same shape the unit test uses). It is not
// dictation: the real speech recognizer is only compiled, never run (O-8).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn } from './helpers';

type Call = {
	o: { preferOffline?: boolean };
	resolve: (r: { text: string }) => void;
	reject: (e: unknown) => void;
};

/** makes the page think it is the Android app, with a Speech plugin the test drives (D-V4-20) */
const fakeApp = (page: Page) =>
	page.addInitScript(() => {
		const w = window as unknown as Record<string, unknown>;
		w.Capacitor = {
			isNativePlatform: () => true,
			Plugins: {
				Speech: {
					listen: (o: { preferOffline?: boolean }) =>
						new Promise((resolve, reject) => (w.__speech as Call[]).push({ o, resolve, reject })),
				},
			},
		};
		w.__speech = [];
	});
const calls = (page: Page) =>
	page.evaluate(() => (window as unknown as { __speech: Call[] }).__speech.length);
const last = (page: Page) =>
	page.evaluate(() => {
		const all = (window as unknown as { __speech: Call[] }).__speech;
		return all[all.length - 1]?.o;
	});
const say = (page: Page, text: string) =>
	page.evaluate((t) => {
		const all = (window as unknown as { __speech: Call[] }).__speech;
		all[all.length - 1]?.resolve({ text: t });
	}, text);
const sayFirst = (page: Page, text: string) =>
	page.evaluate((t) => (window as unknown as { __speech: Call[] }).__speech[0]?.resolve({ text: t }), text);
const fail = (page: Page, e: unknown) =>
	page.evaluate((x) => {
		const all = (window as unknown as { __speech: Call[] }).__speech;
		all[all.length - 1]?.reject(x);
	}, e);

async function openNote(page: Page, title: string, body: string) {
	await page.evaluate(
		async ([t, b]) => {
			await fetch('/api/keep/notes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: t, body: b }),
			});
		},
		[title, body] as const,
	);
	await page.goto('/keep');
	await page.locator('article.note', { hasText: title }).getByText(title).click();
	const note = page.getByRole('dialog', { name: title, exact: true });
	await expect(note).toBeVisible();
	return note;
}
const mic = (note: Locator) => note.getByRole('button', { name: 'Speak note' });
const value = (body: Locator) => body.evaluate((el) => (el as HTMLTextAreaElement).value);
const caret = (body: Locator) =>
	body.evaluate((el) => [
		(el as HTMLTextAreaElement).selectionStart,
		(el as HTMLTextAreaElement).selectionEnd,
	]);

test('C4/C10 no mic on the phone note screen; 48 dp and no desktop hints on the open note', async ({
	page,
}) => {
	await signIn(page);
	const title = `No mic ${Date.now().toString(36)}`;
	const note = await openNote(page, title, 'hello');
	await expect(note.getByRole('textbox').nth(1)).toBeVisible();

	// C4: the phone note screen has no mic and no microphone sheet
	await expect(note.getByRole('button', { name: 'Speak note' })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Use the microphone?' })).toHaveCount(0);
	expect(await page.locator('.mic').count()).toBe(0);

	// C10: every visible control is still 48 dp and nothing says Click / Ctrl / Esc
	await expectTargets48(page);
	await noDesktopHints(page);
});

test('C5/C6/C10 faked app: 48 dp mic, sheet first, Not now asks nothing, Continue listens and inserts at the caret', async ({
	page,
}) => {
	await fakeApp(page);
	await signIn(page);
	const note = await openNote(page, `Voice ${Date.now().toString(36)}`, 'hello world');
	const body = note.getByRole('textbox').nth(1);
	const speak = mic(note);
	await expect(speak).toBeVisible();
	const box = (await speak.boundingBox())!;
	expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48); // C5 / C10

	// C6: the first tap opens the rationale sheet before any recognizer starts
	await speak.click();
	const sheet = page.getByRole('dialog', { name: 'Use the microphone?' });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByText('Life Tracker only listens while this button is on.')).toBeVisible();
	await expect(
		sheet.getByText("Speech is turned into text by Android's speech service, on your phone when it can."),
	).toBeVisible(); // O-7 verbatim
	expect(await calls(page)).toBe(0);
	await sheet.getByRole('button', { name: 'Not now' }).click();
	await expect(sheet).toBeHidden();
	expect(await calls(page)).toBe(0); // Not now requested nothing
	await expect(note).toBeVisible();

	// C6: the next tap (rationale already shown this session) is what asks the plugin — and so Android
	await body.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(6, 6)); // after "hello "
	await speak.click();
	await expect(sheet).toBeHidden();
	await expect.poll(() => calls(page)).toBe(1);
	expect(await last(page)).toEqual({ preferOffline: true }); // C3
	await expect(speak).toHaveAttribute('aria-pressed', 'true');
	await expect(body).toHaveAttribute('placeholder', 'Listening…'); // C5 / C12 loading

	// C8: the words land at the caret, nothing around them changes, and the note autosaves
	await say(page, 'big ');
	await expect.poll(() => value(body)).toBe('hello big world');
	expect(await caret(body)).toEqual([10, 10]);
	await expect(speak).toHaveAttribute('aria-pressed', 'false');
	await expect(note.getByRole('status')).toContainText('Saved');
	await expect(page.locator('.toast')).toHaveCount(0); // C11: dictation is typing, so no toast and no undo entry
});

test('C5 a second tap stops and keeps what arrived; C7 a denial greys the mic but never disables it', async ({
	page,
}) => {
	await fakeApp(page);
	await signIn(page);
	const note = await openNote(page, `Stop ${Date.now().toString(36)}`, '');
	const body = note.getByRole('textbox').nth(1);
	const speak = mic(note);

	await speak.click(); // rationale
	await page
		.getByRole('dialog', { name: 'Use the microphone?' })
		.getByRole('button', { name: 'Continue' })
		.click();
	await expect(speak).toHaveAttribute('aria-pressed', 'true');
	await speak.click(); // C5: tap again = stop
	await expect(speak).toHaveAttribute('aria-pressed', 'false');
	await sayFirst(page, 'half heard'); // the plugin resolves the first call with what arrived
	await expect.poll(() => value(body)).toBe('half heard');

	// C7: RECORD_AUDIO denied in Android's own dialog
	await speak.click();
	await fail(page, { code: 'permission', message: 'denied' });
	await expect(page.locator('.toast')).toHaveText(
		/Microphone is off for Life Tracker\. Turn it on in Android settings\./,
	);
	await expect(speak).toHaveClass(/denied/);
	await expect(speak).toBeEnabled(); // never disabled: a grant in Android settings works on the next tap
	await speak.click(); // every tap still calls listen()
	await expect.poll(() => calls(page)).toBe(4);
	expect(await last(page)).toEqual({ preferOffline: true });
});

test('C10 Back closes the rationale sheet before the note; the sheet’s buttons are 48 dp', async ({
	page,
}) => {
	await fakeApp(page);
	await signIn(page);
	const note = await openNote(page, `Back ${Date.now().toString(36)}`, 'hello');
	await mic(note).click();
	const sheet = page.getByRole('dialog', { name: 'Use the microphone?' });
	await expect(sheet).toBeVisible();
	await expectTargets48(page);
	await page.goBack();
	await expect(sheet).toBeHidden();
	await expect(note).toBeVisible(); // Back closed only the sheet
});

test('C8/C12 empty and failed dictation: the note stays unchanged and the button returns to idle', async ({
	page,
}) => {
	await fakeApp(page);
	await signIn(page);
	const note = await openNote(page, `Empty ${Date.now().toString(36)}`, 'hello');
	const body = note.getByRole('textbox').nth(1);
	const speak = mic(note);

	await speak.click();
	await page
		.getByRole('dialog', { name: 'Use the microphone?' })
		.getByRole('button', { name: 'Continue' })
		.click();
	await say(page, ''); // NO_MATCH / zero words
	await expect.poll(() => value(body)).toBe('hello');
	await expect(speak).toHaveAttribute('aria-pressed', 'false');

	// C12: no speech recognizer on the phone
	await speak.click();
	await fail(page, { code: 'no_service' });
	await expect(page.locator('.toast')).toHaveText(/Speech isn't available on this phone\./);
	await expect(speak).toHaveAttribute('aria-pressed', 'false');

	// C12: anything else goes to the existing error toast
	await speak.click();
	await fail(page, { code: 'recognizer_error', message: 'Speech failed. Try again.' });
	await expect(page.getByRole('alert')).toContainText('Speech failed. Try again.');
	await expect(speak).toHaveAttribute('aria-pressed', 'false');
	await expect.poll(() => value(body)).toBe('hello');
});
