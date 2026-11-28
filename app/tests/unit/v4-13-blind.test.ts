// Blind test for card 13, C3, from its Done-when line only: the Speech bridge (canDictate, dictate,
// toastFor) with a fake globalThis.Capacitor, same pattern as haptics.test.ts. No builder test was opened.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canDictate, dictate, toastFor } from '../../src/lib/client/speech';
import { closeToast, toast } from '../../src/lib/client/toast.svelte';

const g = globalThis as Record<string, unknown>;

/** the real Capacitor injects one global: { isNativePlatform(), Plugins: { Speech: { listen } } } */
function app(plugin = true) {
	const listen = vi.fn(async () => ({ text: 'heard words' }));
	g.Capacitor = {
		isNativePlatform: () => true,
		Plugins: plugin ? { Speech: { listen } } : {},
	};
	return listen;
}

afterEach(() => {
	delete g.Capacitor;
	closeToast();
	vi.unstubAllGlobals();
});

describe('C3 canDictate', () => {
	it('true in the app with the plugin, false in the app without it, false in a browser', () => {
		app();
		expect(canDictate()).toBe(true);

		app(false); // the app shell is there, the Speech plugin is not registered
		expect(canDictate()).toBe(false);

		delete g.Capacitor; // a plain browser
		expect(canDictate()).toBe(false);

		// a plugin object on a web page is still not the app: isApp() must be true as well
		g.Capacitor = { isNativePlatform: () => false, Plugins: { Speech: { listen: vi.fn() } } };
		expect(canDictate()).toBe(false);
	});
});

describe('C3 dictate', () => {
	it('calls listen({ preferOffline: true }) once and resolves with the plugin text', async () => {
		const listen = app();

		const text = await dictate();

		expect(text).toBe('heard words');
		expect(listen).toHaveBeenCalledTimes(1);
		expect(listen).toHaveBeenCalledWith({ preferOffline: true });
	});

	it('shows what failed: an info toast for permission and no_service, the error toast for anything else', async () => {
		const listen = app();

		listen.mockRejectedValueOnce({ code: 'permission' });
		await expect(dictate()).rejects.toMatchObject({ code: 'permission' });
		expect(toast.current).toMatchObject({
			kind: 'info',
			text: 'Microphone is off for Life Tracker. Turn it on in Android settings.',
		});

		listen.mockRejectedValueOnce({ code: 'no_service' });
		await expect(dictate()).rejects.toMatchObject({ code: 'no_service' });
		expect(toast.current).toMatchObject({
			kind: 'info',
			text: "Speech isn't available on this phone.",
		});

		listen.mockRejectedValueOnce(new Error('Recognizer busy'));
		await expect(dictate()).rejects.toThrow('Recognizer busy');
		expect(toast.current).toMatchObject({ kind: 'error', text: 'Recognizer busy' });
	});
});

describe('C3 toastFor', () => {
	it('maps no_service and permission to an info toast with the fixed text', () => {
		expect(toastFor({ code: 'no_service' })).toEqual({
			kind: 'info',
			text: "Speech isn't available on this phone.",
		});
		expect(toastFor({ code: 'permission' })).toEqual({
			kind: 'info',
			text: 'Microphone is off for Life Tracker. Turn it on in Android settings.',
		});
	});

	it('maps anything else to an error toast, keeping its message when it has one', () => {
		expect(toastFor(new Error('Recognizer busy'))).toEqual({ kind: 'error', text: 'Recognizer busy' });
		expect(toastFor({})).toEqual({ kind: 'error', text: 'Speech failed' });
		expect(toastFor(null)).toEqual({ kind: 'error', text: 'Speech failed' });
	});
});
