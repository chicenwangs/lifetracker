// Voice note (card 13, app only): Android's own speech recognizer behind the Speech plugin (mobile/…/Speech.java).
// Text only — nothing is recorded, stored, uploaded or sent to the server. No web path: Chrome's Web Speech API
// would send the audio to Google (PLAN §3).
import { isApp, speech } from './native';
import { showError, showToast } from './toast.svelte';

type SpeechError = { code?: string; message?: string };

/** C3: the mic exists only in the app, where the plugin is present */
export const canDictate = () => isApp() && !!speech();

/** C7/C12: what a failed dictation says (D-V4-20), pure so it can be read without a toast */
export function toastFor(err: unknown): { kind: 'info' | 'error'; text: string } {
	const code = (err as SpeechError | null)?.code;
	if (code === 'no_service') return { kind: 'info', text: "Speech isn't available on this phone." };
	if (code === 'permission')
		return { kind: 'info', text: 'Microphone is off for Life Tracker. Turn it on in Android settings.' };
	return { kind: 'error', text: (err as SpeechError | null)?.message ?? 'Speech failed' };
}

export const isPermissionError = (err: unknown) => (err as SpeechError | null)?.code === 'permission';

let running = false;
/** C5: closing the note stops a recognition that is still running (a finished one must not start again) */
export const stopDictation = () =>
	running
		? void speech()
				?.listen({ preferOffline: true })
				.catch(() => {})
		: undefined;

/** C3: one dictation, on-device when the phone can; resolves with the text, rejects after saying why */
export async function dictate(): Promise<string> {
	running = true;
	try {
		return (await speech()?.listen({ preferOffline: true }))?.text ?? '';
	} catch (e) {
		const t = toastFor(e);
		if (t.kind === 'error') showError(new Error(t.text));
		else showToast(t.text);
		throw e;
	} finally {
		running = false; // the plugin's second listen stops only a live one
	}
}

// C6/C7: the in-app rationale is shown on the first tap of a session, never again after a denial.
let rationale = false;
export const needsRationale = () => !rationale;
export const markRationale = () => void (rationale = true);
