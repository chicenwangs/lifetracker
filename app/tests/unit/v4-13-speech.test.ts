// Card 13 (O-7, O-8, D-V4-20): the JS bridge to the Android Speech plugin — app only, no web path.
// Real Capacitor behaves like haptics.test.ts's fake: window.Capacitor with Plugins.<name>.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canDictate, dictate, toastFor } from '../../src/lib/client/speech';
import { toast } from '../../src/lib/client/toast.svelte';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
	delete g.Capacitor;
});

describe('canDictate', () => {
	it('C3 app with the Speech plugin can dictate', () => {
		g.Capacitor = { isNativePlatform: () => true, Plugins: { Speech: { listen: vi.fn() } } };
		expect(canDictate()).toBe(true);
	});
	it('C3 app without the plugin cannot', () => {
		g.Capacitor = { isNativePlatform: () => true, Plugins: {} };
		expect(canDictate()).toBe(false);
	});
	it('C3 a browser cannot, even if something injects a plugin', () => {
		expect(canDictate()).toBe(false);
		g.Capacitor = { isNativePlatform: () => false, Plugins: { Speech: { listen: vi.fn() } } };
		expect(canDictate()).toBe(false);
	});
});

describe('dictate', () => {
	it('C3 prefers on-device speech and returns the text', async () => {
		const listen = vi.fn(async () => ({ text: 'milk and eggs' }));
		g.Capacitor = { isNativePlatform: () => true, Plugins: { Speech: { listen } } };
		await expect(dictate()).resolves.toBe('milk and eggs');
		expect(listen).toHaveBeenCalledWith({ preferOffline: true });
	});
	it('C3 shows the mapped toast and rejects, so the button returns to idle', async () => {
		g.Capacitor = {
			isNativePlatform: () => true,
			Plugins: { Speech: { listen: () => Promise.reject({ code: 'no_service' }) } },
		};
		await expect(dictate()).rejects.toBeTruthy();
		expect(toast.current).toMatchObject({
			kind: 'info',
			text: "Speech isn't available on this phone.",
		});
	});
});

describe('toastFor', () => {
	it('C3/C12 no speech service is a fixed info toast', () => {
		expect(toastFor({ code: 'no_service' })).toEqual({
			kind: 'info',
			text: "Speech isn't available on this phone.",
		});
	});
	it('C3/C7 a denied microphone says how to turn it on', () => {
		expect(toastFor({ code: 'permission' })).toEqual({
			kind: 'info',
			text: 'Microphone is off for Life Tracker. Turn it on in Android settings.',
		});
	});
	it('C3 anything else is an error', () => {
		expect(toastFor(new Error('Recognizer busy'))).toEqual({ kind: 'error', text: 'Recognizer busy' });
	});
});
